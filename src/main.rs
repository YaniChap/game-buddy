use astra_plugin_sdk::prelude::*;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use std::path::PathBuf;
use tokio_stream::StreamExt;

const GAME_EVENT_TYPES: &[&str] = &["games_changed", "companion_game_changed"];
fn steam_token_path() -> anyhow::Result<PathBuf> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .ok_or_else(|| anyhow::anyhow!("LOCALAPPDATA is not available"))?;

    Ok(PathBuf::from(local_app_data)
        .join("GameBuddy")
        .join("steam_token.txt"))
}

fn save_steam_token(token: &str) -> anyhow::Result<()> {
    let path = steam_token_path()?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    std::fs::write(path, token)?;
    Ok(())
}

fn read_saved_steam_token() -> Option<String> {
    let path = steam_token_path().ok()?;
    let token = std::fs::read_to_string(path).ok()?;
    let token = token.trim().to_string();

    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}

#[astra::config]
#[derive(Default)]
struct GameBuddyConfig {}
#[derive(Default)]
struct GameBuddy {
    state: Arc<Mutex<SessionState>>,
    config: Arc<Config<GameBuddyConfig>>,
}

#[derive(Default)]
struct SessionState {
    active: Option<TrackedSession>,
    last: Option<FinishedSession>,
    initialized: bool,
}

#[derive(Clone)]
struct TrackedSession {
    game: String,
    started_at: u64,
    moments: Vec<String>,
}
#[derive(Clone)]
struct FinishedSession {
    game: String,
    started_at: u64,
    ended_at: u64,
    moments: Vec<String>,
}
#[astra::args]
struct PairSteamRequest {
    /// Восьмизначный код с сайта GameBuddy
    code: String,
}

#[astra::args]
struct CoachRequest {
    /// Name of the game
    game: String,
    /// What is happening right now: boss, mission, puzzle, build, ranked match, etc.
    situation: String,
    /// Optional tone: friendly, sarcastic, energetic, or calm
    #[serde(default)]
    tone: String,
}

#[astra::args]
struct SessionRequest {
    /// Game name; leave empty to use the last detected session
    #[serde(default)]
    game: String,
    /// Additional highlights such as wins, achievements, completed quests
    #[serde(default)]
    highlights: String,
    /// Difficulties, losses, or unfinished goals
    #[serde(default)]
    difficulties: String,
}

#[astra::args]
struct MomentRequest {
    /// Type of moment: achievement, victory, defeat, funny, milestone, or note
    kind: String,
    /// Short description of what happened; do not invent facts
    description: String,
}

#[astra::args]
struct SteamAchievementsRequest {
    /// AppID игры в Steam
    appid: u32,
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn format_duration(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    if hours > 0 {
        format!("{hours} ч. {minutes} мин.")
    } else {
        format!("{minutes} мин.")
    }
}

fn clean_text(value: &str) -> String {
    value.trim().chars().take(180).collect()
}

/// Find a plausible game name without assuming a particular event payload schema.
/// Only explicit game-related keys are trusted; arbitrary `name` fields are ignored.
fn find_game_name(value: &serde_json::Value) -> Option<String> {
    const KEYS: &[&str] = &[
        "game_name", "gameName", "game_title", "gameTitle", "active_game",
        "activeGame", "selected_game", "selectedGame", "companion_game",
        "companionGame", "game", "app_name", "appName",
    ];
    match value {
        serde_json::Value::Object(map) => {
            for key in KEYS {
                if let Some(candidate) = map.get(*key) {
                    if let Some(name) = candidate.as_str().filter(|s| !s.trim().is_empty()) {
                        return Some(clean_text(name));
                    }
                    if let Some(name) = candidate.as_object().and_then(|obj| {
                        ["title", "name", "display_name", "displayName"]
                            .iter().find_map(|field| obj.get(*field).and_then(|v| v.as_str()))
                    }).filter(|s| !s.trim().is_empty()) {
                        return Some(clean_text(name));
                    }
                    if let Some(name) = find_game_name(candidate) {
                        return Some(name);
                    }
                }
            }
            map.values().find_map(find_game_name)
        }
        serde_json::Value::Array(items) => items.iter().find_map(find_game_name),
        _ => None,
    }
}

fn explicitly_clears_game(value: &serde_json::Value) -> bool {
    const KEYS: &[&str] = &[
        "game", "game_name", "gameName", "active_game", "activeGame",
        "selected_game", "selectedGame", "companion_game", "companionGame",
    ];
    match value {
        serde_json::Value::Object(map) => {
            KEYS.iter().any(|key| {
                map.get(*key).is_some_and(|v| {
                    v.is_null() || v.as_str().is_some_and(|s| s.trim().is_empty())
                })
            }) || map.values().any(explicitly_clears_game)
        }
        serde_json::Value::Array(items) => items.iter().any(explicitly_clears_game),
        _ => false,
    }
}

/// Capture achievement-like fields only when Astra actually includes them in a known event.
/// This is intentionally not a subscription to an undocumented event name.
fn find_achievement(value: &serde_json::Value) -> Option<String> {
    const KEYS: &[&str] = &[
        "achievement", "achievement_name", "achievementName", "unlocked_achievement",
        "unlockedAchievement", "milestone", "milestone_name", "milestoneName",
    ];
    match value {
        serde_json::Value::Object(map) => {
            for key in KEYS {
                if let Some(candidate) = map.get(*key) {
                    if let Some(s) = candidate.as_str().filter(|s| !s.trim().is_empty()) {
                        return Some(clean_text(s));
                    }
                    if let Some(s) = candidate.as_object().and_then(|obj| {
                        ["name", "title", "display_name", "displayName"]
                            .iter().find_map(|field| obj.get(*field).and_then(|v| v.as_str()))
                    }).filter(|s| !s.trim().is_empty()) {
                        return Some(clean_text(s));
                    }
                    if let Some(s) = find_achievement(candidate) {
                        return Some(s);
                    }
                }
            }
            map.values().find_map(find_achievement)
        }
        serde_json::Value::Array(items) => items.iter().find_map(find_achievement),
        _ => None,
    }
}

async fn send_companion_message(ctx: &PluginContext, message: &str) {
    match ctx.host().send_chat_message(message, "", true).await {
        Ok(mut reply_stream) => {
            // Drain the reply in the background: event handling stays responsive.
            let host = ctx.host().clone();
            tokio::spawn(async move {
                while let Some(chunk) = reply_stream.next().await {
                    if let Err(err) = chunk {
                        let _ = host.log_warn(&format!("GameBuddy chat reply stream ended with an error: {err}")).await;
                        break;
                    }
                }
            });
            let _ = ctx.host().log_info("GameBuddy sent a companion message").await;
        }
        Err(err) => {
            let _ = ctx.host().log_warn(&format!("GameBuddy send error details: {err:#?}")).await;
        }
    }
}

#[astra::plugin]
impl GameBuddy {
    /// Subscribe only to the two game-related events supplied by Astra's event vocabulary.
    #[hook]
    fn subscribed_events(&self) -> Vec<String> {
        GAME_EVENT_TYPES.iter().map(|s| (*s).to_string()).collect()
    }
    #[hook]
    async fn ui_contributions(&self) -> Vec<UiContribution> {
        vec![
            UiContribution::page("main", "GameBuddy", "index.html")
        ]
    }

    /// Открывает сайт GameBuddy во внешнем браузере Windows.
    #[ui_call]
    async fn open_website(&self) -> Result<String, ToolError> {
        std::process::Command::new("cmd")
            .args([
                "/C",
                "start",
                "",
                "https://gamebuddy-steam.yanichap55.workers.dev/"
            ])
            .spawn()
            .map_err(ToolError::internal)?;

          Ok(r#"{"ok":true}"#.into())
    }


    /// Получить данные Steam для главной панели GameBuddy.
    #[ui_call]
    async fn dashboard_data(&self) -> Result<String, ToolError> {
        let data = self.steam_api_get("/api/steam/activity").await?;

        let recent = data["recentGames"]
            .as_array()
            .and_then(|games| games.first());

        let current_game = data["currentGame"]["name"]
            .as_str()
            .unwrap_or("");

let recent_game = {
    let state = self.state.lock().unwrap_or_else(|p| p.into_inner());

    state.active.as_ref()
        .map(|session| session.game.clone())
        .or_else(|| state.last.as_ref().map(|session| session.game.clone()))
        .unwrap_or_else(|| {
            recent
                .and_then(|game| game["name"].as_str())
                .unwrap_or("")
                .to_string()
        })
};

        let playtime_minutes = recent
            .and_then(|game| game["playtimeRecentMinutes"].as_u64())
            .unwrap_or(0);

        let result = serde_json::json!({
            "connected": true,
            "online": data["online"].as_bool().unwrap_or(false),
            "currentGame": current_game,
            "lastGame": recent_game,
            "playtimeRecentMinutes": playtime_minutes
        });

        Ok(result.to_string())
    }

#[hook]
async fn on_start(&self, ctx: &PluginContext) -> anyhow::Result<()> {
	let _ = ctx.host().log_info(
    "GameBuddy: on_start запущен, фоновая проверка готовится"
	).await;
    let ctx = ctx.clone();
    let state = Arc::clone(&self.state);
    let _config = Arc::clone(&self.config);

    tokio::spawn(async move {
        let client = reqwest::Client::new();

        loop {
         let token = read_saved_steam_token().unwrap_or_default();

            if !token.is_empty() {
                let result = client
                    .get("https://gamebuddy-steam.yanichap55.workers.dev/api/steam/activity")
                    .bearer_auth(&token)
                    .send()
                    .await;

                if let Ok(response) = result {
                    if let Ok(data) = response.json::<serde_json::Value>().await {
                        let game = data["currentGame"]["name"]
                            .as_str()
                            .filter(|name| !name.trim().is_empty())
                            .map(str::to_string);
let game_status = game.as_deref().unwrap_or("нет активной игры");
let _ = ctx.host().log_info(
    &format!("GameBuddy polling: Steam сообщает — {game_status}")
).await;

                        let now = now_unix();

                        let (ended, started, first_check) = {
                            let mut state = state.lock()
                                .unwrap_or_else(|p| p.into_inner());

                            let first = !state.initialized;
                            state.initialized = true;

                            let same_game = state.active.as_ref()
                                .zip(game.as_ref())
                                .is_some_and(|(old, new)|
                                    old.game.eq_ignore_ascii_case(new)
                                );

                            if same_game {
                                (None, None, first)
                            } else if let Some(game) = game {
                                let ended = state.active.take().map(|old| {
                                    FinishedSession {
                                        game: old.game,
                                        started_at: old.started_at,
                                        ended_at: now,
                                        moments: old.moments,
                                    }
                                });

                                if let Some(ref finished) = ended {
                                    state.last = Some(finished.clone());
                                }

                                state.active = Some(TrackedSession {
                                    game: game.clone(),
                                    started_at: now,
                                    moments: Vec::new(),
                                });

                                (ended, Some(game), first)
                            } else {
                                let ended = state.active.take().map(|old| {
                                    FinishedSession {
                                        game: old.game,
                                        started_at: old.started_at,
                                        ended_at: now,
                                        moments: old.moments,
                                    }
                                });

                                if let Some(ref finished) = ended {
                                    state.last = Some(finished.clone());
                                }

                                (ended, None, first)
                            }
                        };

                        if let Some(session) = ended {
                            let duration = format_duration(
                                session.ended_at.saturating_sub(session.started_at)
                            );

                            send_companion_message(
                                &ctx,
                                &format!(
                                    "GameBuddy: игровая сессия в {} завершилась. Ты играл {}. Отличная работа! До следующего захода!",
                                    session.game,
                                    duration
                                )
                            ).await;
                        }

                        if let Some(game) = started {
                            if !first_check {
                                send_companion_message(
                                    &ctx,
                                    &format!(
                                        "GameBuddy: о, ты запустил {game}! Я рядом, приятной игры!"
                                    )
                                ).await;
                            }
                        }
                    }
                }
            }

            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    });

    Ok(())
}

    #[hook]
    async fn on_config(&self, _ctx: &PluginContext, config: GameBuddyConfig) {
        self.config.store(config);
    }

    /// Track game changes, open/close sessions, and post a short message on real transitions.
    #[hook]
    async fn on_event(&self, ctx: &PluginContext, event_type: &str, payload_json: &str) {
let parsed: serde_json::Value = match serde_json::from_str(payload_json) {
    Ok(value) => value,
    Err(err) => {
        let _ = ctx.host().log_warn(
            &format!("GameBuddy: invalid event JSON: {err:#?}")
        ).await;
        return;
    }
};

        if let Some(achievement) = find_achievement(&parsed) {
            let moment = format!("Достижение / важный момент: {achievement}");
            let game = {
                let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
                if let Some(session) = state.active.as_mut() {
                    session.moments.push(moment.clone());
                    Some(session.game.clone())
                } else {
                    None
                }
            };
            if let Some(game) = game {
                send_companion_message(ctx, &format!(
                    "GameBuddy: похоже, в {game} произошло важное событие — {achievement}. Поздравляю! Если это не достижение, а просто поле из данных игры, поправь меня."
                )).await;
            }
        }

if event_type == "games_changed" {
    let _ = ctx.host().log_info("GameBuddy: games_changed received; checking Steam activity").await;

    match self.steam_api_get("/api/steam/activity").await {
        Ok(data) => {
            let game = data["currentGame"]["name"]
                .as_str()
                .unwrap_or("no active game");

            let _ = ctx.host().log_info(
                &format!("GameBuddy: Steam currently reports: {game}")
            ).await;
        }
        Err(err) => {
            let _ = ctx.host().log_warn(
                &format!("GameBuddy: Steam activity check failed: {err}")
            ).await;
        }
    }

    return;
}
        if event_type != "companion_game_changed" {
            return;
        }

        let new_game = find_game_name(&parsed);
        let clear_signal = explicitly_clears_game(&parsed);
        let now = now_unix();
        let (ended, started) = {
            let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
            let same_game = state.active.as_ref().zip(new_game.as_ref())
                .is_some_and(|(old, new)| old.game.eq_ignore_ascii_case(new));
            if same_game {
                (None, None)
            } else if let Some(game) = new_game {
                let ended = state.active.take().map(|old| FinishedSession {
                    game: old.game,
                    started_at: old.started_at,
                    ended_at: now,
                    moments: old.moments,
                });
                if let Some(ref finished) = ended {
                    state.last = Some(finished.clone());
                }
                state.active = Some(TrackedSession { game: game.clone(), started_at: now, moments: Vec::new() });
                (ended, Some(game))
            } else if clear_signal {
                let ended = state.active.take().map(|old| FinishedSession {
                    game: old.game,
                    started_at: old.started_at,
                    ended_at: now,
                    moments: old.moments,
                });
                if let Some(ref finished) = ended {
                    state.last = Some(finished.clone());
                }
                (ended, None)
            } else {
                (None, None)
            }
        };

        if let Some(session) = ended {
            let duration = format_duration(session.ended_at.saturating_sub(session.started_at));
            let moments = if session.moments.is_empty() { "пока не записаны".to_string() } else { session.moments.join("; ") };
            send_companion_message(ctx, &format!(
                "GameBuddy: игровая сессия в {game} завершилась. По моим данным, ты играл {duration}. Зафиксированные моменты: {moments}. Подведи короткий итог по-дружески, не выдумывай победы, достижения или статистику; закончи одной идеей на следующий заход.",
                game = session.game
            )).await;
        }
        if let Some(game) = started {
            send_companion_message(ctx, &format!(
                "GameBuddy: вижу, ты переключился на {game}! Я на связи. Могу подсказать тактику, поддержать или слегка подколоть — обещаю не спойлерить без спроса."
            )).await;
        }
    }

    /// Получить подключённый Steam-токен из настроек плагина.
fn steam_token(&self) -> Result<String, ToolError> {
    read_saved_steam_token().ok_or_else(|| {
        ToolError::Internal(
            "Сначала подключи Steam через GameBuddy.".into()
        )
    })
}

    /// Выполнить защищённый запрос к Steam API через сервер GameBuddy.
    async fn steam_api_get(&self, endpoint: &str) -> Result<serde_json::Value, ToolError> {
        let token = self.steam_token()?;

        let url = format!(
            "https://gamebuddy-steam.yanichap55.workers.dev{}",
            endpoint
        );

        let response = reqwest::Client::new()
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| ToolError::Internal(
                "Не удалось связаться с сервером GameBuddy.".into()
            ))?;

        let status = response.status();

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|_| ToolError::Internal(
                "Сервер GameBuddy вернул некорректный ответ.".into()
            ))?;

        if !status.is_success() {
            let message = data["error"]
                .as_str()
                .unwrap_or("Не удалось получить данные Steam.");

            return Err(ToolError::Internal(message.to_string()));
        }

        Ok(data)
    }

    /// Показать игры из библиотеки Steam и время, проведённое в них.
    #[tool]
   
async fn steam_library(&self) -> Result<String, ToolError> {
    let data = self.steam_api_get("/api/steam/library").await?;

    let games = data["games"]
        .as_array()
        .ok_or_else(|| ToolError::Internal(
            "Сервер не вернул список игр.".into()
        ))?;

    if games.is_empty() {
        return Ok(
            "Библиотека Steam пуста или скрыта настройками приватности.".into()
        );
    }

    let mut result = String::from("Твоя библиотека Steam:\n\n");

    for game in games.iter().take(50) {
        let name = game["name"]
            .as_str()
            .unwrap_or("Неизвестная игра");

        let appid = game["appId"]
            .as_u64()
            .unwrap_or(0);

        let minutes = game["playtimeMinutes"]
            .as_u64()
            .unwrap_or(0);

        let hours = minutes / 60;

        result.push_str(&format!(
            "• {name} — {hours} ч. (AppID: {appid})\n"
        ));
    }

    if games.len() > 50 {
        result.push_str(&format!(
            "\nПоказаны первые 50 из {} игр.",
            games.len()
        ));
    }

    Ok(result)
}


 /// Показать недавно запущенные игры Steam.
#[tool]
async fn steam_recent_games(&self) -> Result<String, ToolError> {
    let data = self.steam_api_get("/api/steam/activity").await?;

    let games = data["recentGames"]
        .as_array()
        .ok_or_else(|| ToolError::Internal(
            "Сервер не вернул список недавних игр.".into()
        ))?;

    if games.is_empty() {
        return Ok(
            "Steam не сообщает о недавно запущенных играх. Возможно, данные скрыты настройками приватности.".into()
        );
    }

    let mut result = String::from("Недавно запущенные игры:\n\n");

    for game in games {
        let name = game["name"]
            .as_str()
            .unwrap_or("Неизвестная игра");

        let minutes = game["playtimeRecentMinutes"]
            .as_u64()
            .unwrap_or(0);

        result.push_str(&format!(
            "• {name} — {} ч. за последние две недели\n",
            minutes / 60
        ));
    }

    Ok(result)
}

    /// Узнать, во что пользователь играет сейчас в Steam.
    #[tool]
   async fn steam_now_playing(&self) -> Result<String, ToolError> {
    let data = self.steam_api_get("/api/steam/activity").await?;

    let is_online = data["online"]
        .as_bool()
        .unwrap_or(false);

    if !is_online {
        return Ok(
            "Пользователь сейчас не отображается в Steam онлайн. Возможно, Steam офлайн или статус скрыт настройками приватности.".into()
        );
    }

    let current_game = &data["currentGame"];

    if current_game.is_null() {
        return Ok("Пользователь сейчас онлайн в Steam, но не отображается как играющий.".into());
    }

    let game = current_game["name"]
        .as_str()
        .unwrap_or("Неизвестная игра");

    Ok(format!("Пользователь сейчас играет в {game}."))
}

    /// Получить достижения Steam для игры по её AppID.
    #[tool]
    async fn steam_achievements(
        &self,
        request: SteamAchievementsRequest,
    ) -> Result<String, ToolError> {
        if request.appid == 0 {
            return Err(ToolError::Internal(
                "AppID должен быть положительным числом.".into()
            ));
        }

        let endpoint = format!("/api/steam/achievements?appid={}", request.appid);
        let data = self.steam_api_get(&endpoint).await?;

        let unlocked = data["unlocked"].as_u64().unwrap_or(0);
        let total = data["total"].as_u64().unwrap_or(0);

        let achievements = data["achievements"]
            .as_array()
            .ok_or_else(|| ToolError::Internal(
                "Сервер не вернул список достижений.".into()
            ))?;

        let mut result = format!(
            "Достижения Steam для игры AppID {}:\nОткрыто: {unlocked} из {total}\n\n",
            request.appid
        );

        for achievement in achievements.iter().filter(|a| {
            a["unlocked"].as_bool().unwrap_or(false)
        }).take(30) {
            let name = achievement["name"]
                .as_str()
                .unwrap_or("Без названия");

            result.push_str(&format!("🏆 {name}\n"));
        }

        if unlocked == 0 {
            result.push_str("Пока нет открытых достижений или Steam не предоставил эти данные.");
        }

        Ok(result)
    }


    /// Подключить Steam через одноразовый код с сайта GameBuddy.
    #[tool]
    async fn connect_steam(&self, request: PairSteamRequest) -> Result<String, ToolError> {
        let code = request.code.trim();

        if code.len() != 8 || !code.chars().all(|c| c.is_ascii_digit()) {
            return Err(ToolError::Internal(
                "Нужен восьмизначный код с сайта GameBuddy.".into()
            ));
        }

        let response = reqwest::Client::new()
            .post("https://gamebuddy-steam.yanichap55.workers.dev/api/pair/redeem")
            .json(&serde_json::json!({ "code": code }))
            .send()
            .await
            .map_err(|_| ToolError::Internal(
                "Не удалось связаться с сервером GameBuddy. Проверь интернет и попробуй ещё раз.".into()
            ))?;

        let status = response.status();
        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|_| ToolError::Internal(
                "Сервер GameBuddy вернул непонятный ответ.".into()
            ))?;

        if !status.is_success() {
            let message = data["error"]
                .as_str()
                .unwrap_or("Код недействителен или срок его действия истёк.");
            return Err(ToolError::Internal(message.to_string()));
        }

        let token = data["token"]
            .as_str()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| ToolError::Internal(
                "Сервер не вернул токен подключения.".into()
            ))?;

save_steam_token(token).map_err(|_| {
    ToolError::Internal(
        "Не удалось сохранить токен GameBuddy на компьютере.".into()
    )
})?;

self.config.store(GameBuddyConfig {});

Ok("Steam успешно подключён к GameBuddy!".into())
    }

    /// Connect Steam from the GameBuddy interface.
    #[ui_call]
    async fn connect_steam_ui(
        &self,
        request: PairSteamRequest,
    ) -> Result<String, ToolError> {
        self.connect_steam(request).await?;

        Ok(r#"{"ok":true,"connected":true}"#.into())
    }


    /// Show the active or most recently completed game session.
    #[tool]
    async fn current_game_session(&self) -> Result<String, ToolError> {
        let state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(session) = state.active.as_ref() {
            let duration = format_duration(now_unix().saturating_sub(session.started_at));
            let moments = if session.moments.is_empty() { "пока нет".to_string() } else { session.moments.join("; ") };
            Ok(format!("Сейчас отслеживается игра: {}. Длительность текущей сессии: {}. Записанные моменты: {}.", session.game, duration, moments))
        } else if let Some(session) = state.last.as_ref() {
            Ok(format!("Активная игра не обнаружена. Последняя сессия: {} — {}. Записанные моменты: {}.", session.game, format_duration(session.ended_at.saturating_sub(session.started_at)), if session.moments.is_empty() { "нет".to_string() } else { session.moments.join("; ") }))
        } else {
            Ok("Пока Astra не прислала событие с названием выбранной игры. Запусти или выбери игру в Astra, чтобы GameBuddy мог начать отсчёт сессии.".into())
        }
    }

    /// Give game-specific advice, encouragement, and a playful comment.
    #[tool]
    async fn game_coach(&self, request: CoachRequest) -> Result<String, ToolError> {
        let tone = if request.tone.trim().is_empty() { "friendly, witty, lightly teasing" } else { request.tone.trim() };
        Ok(format!(
            "Ты GameBuddy — игровой напарник. Помогай по существу, юмор добавляй вторым слоем. Не будь жестоким, не спойлери сюжет без просьбы. Дай 2–4 конкретных совета, затем одну короткую шутку. Если не знаешь конкретную механику игры, честно обозначь это и уточни платформу/режим. Тон: {tone}.\nИгра: {}\nСитуация: {}",
            request.game.trim(), request.situation.trim()
        ))
    }

    /// Record a player-reported achievement, victory, funny moment, or milestone for the session recap.
    #[tool]
    async fn record_game_moment(&self, request: MomentRequest) -> Result<String, ToolError> {
        let kind = clean_text(&request.kind);
        let description = clean_text(&request.description);
        if description.is_empty() {
            return Err(ToolError::Internal("Опиши игровой момент, который нужно записать.".into()));
        }
        let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(session) = state.active.as_mut() {
            let entry = format!("{kind}: {description}");
            session.moments.push(entry.clone());
            Ok(format!("Записал в сессию {}: {}", session.game, entry))
        } else {
            Ok("Сейчас нет активной обнаруженной сессии. Момент не сохранён; сначала выбери игру в Astra или опиши его в чате.".into())
        }
    }

    /// Create a concise, funny end-of-session report from detected session data and player notes.
    #[tool]
    async fn session_report(&self, request: SessionRequest) -> Result<String, ToolError> {
        let state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        let (game, duration, moments) = if let Some(active) = state.active.as_ref() {
            (active.game.clone(), format_duration(now_unix().saturating_sub(active.started_at)), active.moments.join("; "))
        } else if let Some(last) = state.last.as_ref() {
            (last.game.clone(), format_duration(last.ended_at.saturating_sub(last.started_at)), last.moments.join("; "))
        } else {
            (String::new(), "неизвестна".to_string(), String::new())
        };
        let game = if request.game.trim().is_empty() { game } else { request.game.trim().to_string() };
        if game.is_empty() {
            return Ok("Пока нет обнаруженной игровой сессии. Укажи название игры и добавь заметки о победах, достижениях и сложностях.".into());
        }
        Ok(format!(
            "Составь итог сессии от лица GameBuddy. Похвали реальные успехи, мягко пошути над неудачами и предложи одну достижимую цель на следующий заход. Не выдумывай статистику или достижения.\nИгра: {game}\nДлительность по таймеру GameBuddy: {duration}\nАвтоматически/вручную записанные моменты: {}\nДополнительные успехи игрока: {}\nСложности и незавершённые цели: {}\nФормат: вердикт сессии, лучший момент, одна дружеская подколка, цель на следующий раз.",
            if moments.is_empty() { "нет" } else { &moments },
            if request.highlights.trim().is_empty() { "не указаны" } else { request.highlights.trim() },
            if request.difficulties.trim().is_empty() { "не указаны" } else { request.difficulties.trim() }
        ))
    }
}

astra::main!(GameBuddy::default());

#[cfg(test)]
mod tests {
    use super::*;
    use astra_plugin_sdk::testing::Harness;

    #[test]
    fn extracts_game_from_common_game_related_keys() {
        let payload = serde_json::json!({"data": {"selected_game": {"title": "Example RPG"}}});
        assert_eq!(find_game_name(&payload).as_deref(), Some("Example RPG"));
    }

    #[test]
    fn extracts_achievement_only_from_explicit_fields() {
        let payload = serde_json::json!({"achievement": {"name": "First Victory"}});
        assert_eq!(find_achievement(&payload).as_deref(), Some("First Victory"));
    }

    #[test]
    fn detects_explicit_empty_game_signal() {
        let payload = serde_json::json!({"game": null});
        assert!(explicitly_clears_game(&payload));
    }

    #[tokio::test]
    async fn exposes_companion_tools_and_healthy_runtime() {
        let h = Harness::new(GameBuddy::default())
            .with_config(json!({}))
            .start()
            .await
            .expect("the plugin started");

        let coach = h.call_tool("game_coach", json!({
            "game": "Example RPG",
            "situation": "I am stuck at the first boss",
            "tone": "friendly"
        })).await.expect("the coach tool answered");
        assert!(coach.contains("Example RPG"));

        let moment = h.call_tool("record_game_moment", json!({
            "kind": "achievement",
            "description": "Beat the first boss"
        })).await.expect("the moment tool answered");
        assert!(moment.contains("нет активной"));
        assert!(h.health().await.0);
    }
}
