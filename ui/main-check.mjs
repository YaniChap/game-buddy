const container = document.getElementById('app');

try {
  const ui = await astra.loadUi({ apiVersion: 1 });
  const { h } = ui;
  let root;
  const defaults = {
    personality: 'playful', teasing: 65, energy: 60, verbosity: 'balanced', language: 'auto',
    notifications: true, game_started: true, game_ended: true, achievements: true,
    session_reports: true, track_sessions: true, poll_interval: 30, quiet_hours: false,
    quiet_start: '23:00', quiet_end: '08:00', spoilers: false, backseat: false,
    auto_tips: true, remember_moments: true, show_online: true, compact_ui: false,
    streamer_mode: false
  };
  let settings = { ...defaults };
  let activeTab = 'overview';
  let saving = false;
  let dashboard = {
    loading: true, connected: false, online: false, currentGame: '', lastGame: '',
    playtimeRecentMinutes: 0, error: '', pairingCode: '', connectionMessage: '', connecting: false
  };
  const C = {
    bg: '#080711', panel: 'rgba(20,16,35,.92)', panel2: '#171229', border: 'rgba(168,105,255,.20)',
    purple: '#a970ff', purple2: '#7c3aed', text: '#f5f0ff', muted: '#a69bbd', cyan: '#6de7ff',
    green: '#55e6ae', red: '#ff6b91'
  };
  const style = (extra = {}) => ({ boxSizing: 'border-box', ...extra });
  const buttonStyle = (primary = false, danger = false) => style({
    border: `1px solid ${danger ? 'rgba(255,107,145,.45)' : primary ? '#9d62ff' : C.border}`,
    borderRadius: '12px', padding: '12px 15px', color: danger ? '#ff9ab2' : '#fff',
    background: danger ? 'rgba(255,70,115,.10)' : primary ? 'linear-gradient(110deg,#8b43ef,#5725bd)' : '#211936',
    fontWeight: 750, cursor: 'pointer', letterSpacing: '.3px'
  });
  function el(tag, props, ...children) { return h(tag, props || {}, ...children.flat().filter(x => x !== null && x !== undefined && x !== false)); }
  function panel(title, subtitle, ...children) {
    return el('section', { style: style({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '18px', marginBottom: '14px', boxShadow: '0 12px 40px rgba(0,0,0,.20)' }) },
      el('div', { style: { marginBottom: '15px' } },
        el('div', { style: { fontSize: '14px', fontWeight: 800, color: C.text } }, title),
        subtitle ? el('div', { style: { color: C.muted, fontSize: '12px', marginTop: '5px', lineHeight: 1.5 } }, subtitle) : null
      ), ...children);
  }
  function field(label, description, control) {
    return el('div', { style: style({ display: 'flex', gap: '14px', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid rgba(255,255,255,.055)` }) },
      el('div', { style: { minWidth: 0, flex: 1 } },
        el('div', { style: { color: C.text, fontSize: '13px', fontWeight: 650 } }, label),
        description ? el('div', { style: { color: C.muted, fontSize: '11px', marginTop: '4px', lineHeight: 1.45 } }, description) : null
      ), control);
  }
  function select(key, options, width = '160px') {
    return el('select', { value: settings[key], onChange: e => { settings[key] = e.target.value; render(); }, style: style({ width, maxWidth: '48%', background: '#100d1d', color: C.text, border: `1px solid ${C.border}`, borderRadius: '9px', padding: '9px', fontSize: '12px' }) },
      ...options.map(([value, label]) => el('option', { value }, label)));
  }
  function toggle(key) {
    const on = !!settings[key];
    return el('button', { onClick: () => { settings[key] = !settings[key]; render(); }, 'aria-label': key, style: style({ width: '46px', minWidth: '46px', height: '26px', borderRadius: '20px', border: `1px solid ${on ? '#a66aff' : '#514663'}`, background: on ? 'linear-gradient(90deg,#7736d5,#b26cff)' : '#30283c', padding: '3px', cursor: 'pointer', textAlign: on ? 'right' : 'left' }) },
      el('span', { style: style({ display: 'inline-block', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 5px #0008' }) }));
  }
  function range(key, min, max) {
    return el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', width: '48%', minWidth: '120px' } },
      el('input', { type: 'range', min, max, value: settings[key], onInput: e => { settings[key] = Number(e.target.value); const v = e.target.parentNode.querySelector('span'); if (v) v.textContent = settings[key]; }, style: style({ width: '100%', accentColor: C.purple }) }),
      el('span', { style: { color: C.purple, fontSize: '12px', minWidth: '28px', textAlign: 'right' } }, String(settings[key])));
  }
  function stat(label, value, accent = C.purple) {
    return el('div', { style: style({ background: 'linear-gradient(145deg,#1d1631,#110f1d)', border: `1px solid ${accent}44`, borderRadius: '14px', padding: '14px', minWidth: 0 }) },
      el('div', { style: { color: C.muted, fontSize: '10px', letterSpacing: '1px', fontWeight: 700 } }, label),
      el('div', { style: { color: accent, fontSize: '16px', fontWeight: 800, marginTop: '8px', overflowWrap: 'anywhere' } }, value));
  }
  function tabButton(id, label, icon) {
    const active = activeTab === id;
    return el('button', { onClick: () => { activeTab = id; render(); }, style: style({ border: `1px solid ${active ? '#9858f2' : 'transparent'}`, background: active ? 'rgba(145,75,235,.20)' : 'transparent', color: active ? '#fff' : C.muted, borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: active ? 800 : 600, whiteSpace: 'nowrap' }) }, `${icon} ${label}`);
  }
  function renderOverview() {
    const playtime = `${Math.floor(dashboard.playtimeRecentMinutes / 60)} ч ${dashboard.playtimeRecentMinutes % 60} мин`;
    return [
      panel('Игровая телеметрия', 'Текущее состояние Steam и последние игровые данные.',
        el('div', { style: style({ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px' }) },
          stat('STEAM', dashboard.loading ? 'Проверка…' : dashboard.connected ? 'Подключён' : 'Не подключён', dashboard.connected ? C.green : C.red),
          settings.show_online ? stat('СТАТУС', dashboard.online ? 'В сети' : 'Не в сети', dashboard.online ? C.green : C.muted) : stat('СТАТУС', 'Скрыт', C.muted),
          stat('СЕЙЧАС ИГРАЕШЬ', settings.streamer_mode ? 'Скрыто режимом стримера' : dashboard.loading ? '…' : dashboard.currentGame || 'Нет активной игры', C.cyan),
          stat('ЗА 2 НЕДЕЛИ', dashboard.loading ? '…' : playtime, C.purple)
        ),
        el('div', { style: { color: C.muted, fontSize: '12px', marginTop: '12px' } }, `Последняя игра: ${settings.streamer_mode ? 'скрыта' : dashboard.lastGame || 'пока нет данных'}`),
        dashboard.error ? el('div', { style: { color: C.red, fontSize: '12px', marginTop: '10px' } }, dashboard.error) : null,
        el('button', { onClick: loadDashboard, style: style({ ...buttonStyle(true), width: '100%', marginTop: '14px' }) }, '↻  ОБНОВИТЬ ДАННЫЕ')
      ),
      panel('Steam аккаунт', 'Подключение через одноразовый код GameBuddy.',
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          el(ui.Input, { value: dashboard.pairingCode, placeholder: '8-значный код', onChange: value => { dashboard.pairingCode = String(value).replace(/\D/g, '').slice(0, 8); } }),
          el('button', { onClick: connectSteam, disabled: dashboard.connecting, style: buttonStyle(true) }, dashboard.connecting ? 'ПОДКЛЮЧАЕМ…' : 'ПРИВЯЗАТЬ')
        ),
        dashboard.connectionMessage ? el('div', { style: { color: C.cyan, fontSize: '12px', marginTop: '10px' } }, dashboard.connectionMessage) : null,
        el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } },
          el('button', { onClick: async () => { try { await astra.callBackend('open_website', {}); } catch (e) { dashboard.connectionMessage = 'Не удалось открыть сайт.'; render(); } }, style: buttonStyle(false) }, 'ОТКРЫТЬ GAMEBUDDY ↗'),
          dashboard.connected ? el('button', { onClick: disconnectSteam, style: buttonStyle(false, true) }, 'ОТВЯЗАТЬ STEAM') : null
        )
      )
    ];
  }
  function renderPersonality() {
    const personalities = [
      ['playful', '💜 Дружелюбная', 'Поддерживает и иногда шутит'],
      ['roaster', '🔥 Roast-мастер', 'Подкалывает за промахи и игровые решения'],
      ['sarcastic', '😏 Саркастичная', 'Тонкий сарказм и острые комментарии'],
      ['coach', '🎯 Тренер', 'Тактика, спокойная поддержка и разбор ошибок'],
      ['hype', '⚡ Хайп-комментатор', 'Эмоции, победы и максимум энергии'],
      ['chill', '🌙 Чилл', 'Спокойное общение без лишнего шума']
    ];
    return [
      panel('Выбери характер Астры', 'Стиль будет использоваться в игровых реакциях и подсказках.',
        ...personalities.map(([value, title, desc]) => el('button', { onClick: () => { settings.personality = value; render(); }, style: style({ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', padding: '13px', marginBottom: '8px', borderRadius: '12px', border: `1px solid ${settings.personality === value ? '#a970ff' : C.border}`, background: settings.personality === value ? 'rgba(142,75,225,.18)' : '#141020', color: C.text, cursor: 'pointer' }) },
          el('div', { style: { flex: 1 } }, el('div', { style: { fontWeight: 800, fontSize: '13px' } }, title), el('div', { style: { color: C.muted, fontSize: '11px', marginTop: '4px' } }, desc)),
          el('div', { style: { color: settings.personality === value ? C.purple : C.muted, fontSize: '17px' } }, settings.personality === value ? '●' : '○')
        ))
      ),
      panel('Настрой характер', 'Подкалывания должны оставаться дружескими. Астра не унижает игрока.',
        field('Острота подколов', 'От нежных шуток до прожарки игровых решений.', range('teasing', 0, 100)),
        field('Энергичность', 'Насколько эмоционально Астра реагирует на игровые события.', range('energy', 0, 100)),
        field('Длина ответов', 'Выбери, насколько подробно Астра будет отвечать.', select('verbosity', [['short','Коротко'],['balanced','Сбалансированно'],['detailed','Подробно']]))
      )
    ];
  }
  function renderActivity() {
    return [
      panel('Отслеживание игр', 'Управляй тем, какие игровые события GameBuddy замечает.',
        field('Отслеживать игровые сессии', 'Начало, смена и завершение игры.', toggle('track_sessions')),
        field('Сообщать о запуске игры', 'Астра поприветствует тебя при старте игровой сессии.', toggle('game_started')),
        field('Итог после игры', 'Короткий разбор длительности и записанных моментов.', toggle('game_ended')),
        field('Реакции на достижения', 'Поздравления, когда событие содержит данные о достижении.', toggle('achievements')),
        field('Автоматические советы', 'Предлагать тактику и подсказки по ситуации.', toggle('auto_tips')),
        field('Запоминать игровые моменты', 'Сохранять победы, фейлы и заметки в рамках сессии.', toggle('remember_moments')),
        field('Частота проверки Steam', 'Как часто обновлять активную игру.', select('poll_interval', [['15','15 секунд'],['30','30 секунд'],['60','1 минута'],['120','2 минуты'],['300','5 минут']]))
      ),
      panel('Границы общения', 'Настрой, насколько активно Астра вмешивается в игровой процесс.',
        field('Не спойлерить', 'Астра не раскрывает сюжетные повороты без прямой просьбы.', toggle('spoilers')),
        field('Не отвлекать во время матча', 'Учитывать предпочтение игрока к минимальному количеству сообщений.', toggle('backseat')),
        field('Формировать отчёты сессии', 'Разбор лучших моментов и целей на следующий заход.', toggle('session_reports'))
      )
    ];
  }
  function renderNotifications() {
    return [panel('Уведомления и тишина', 'Управляй тем, когда компаньон может писать первым.',
      field('Игровые уведомления', 'Главный переключатель автоматических сообщений.', toggle('notifications')),
      field('Тихие часы', 'Не отправлять автоматические сообщения в выбранный период.', toggle('quiet_hours')),
      field('Начало тишины', 'Локальное время устройства.', el('input', { type: 'time', value: settings.quiet_start, onChange: e => settings.quiet_start = e.target.value, style: style({ background: '#100d1d', color: C.text, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '8px' }) })),
      field('Конец тишины', 'Когда снова можно отправлять сообщения.', el('input', { type: 'time', value: settings.quiet_end, onChange: e => { settings.quiet_end = e.target.value; }, style: style({ background: '#100d1d', color: C.text, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '8px' }) }))
    )] ;
  }
  function renderAppearance() {
    return [
      panel('Язык и отображение', 'Визуальные и языковые предпочтения.',
        field('Язык Астры', 'Автоматически использовать язык диалога или выбрать вручную.', select('language', [['auto','Авто'],['ru','Русский'],['en','English']])),
        field('Показывать онлайн-статус', 'Отображать статус Steam на главной панели.', toggle('show_online')),
        field('Компактный интерфейс', 'Уменьшить отступы и плотнее расположить карточки.', toggle('compact_ui')),
        field('Режим стримера', 'Скрывать потенциально личные данные в интерфейсе.', toggle('streamer_mode'))
      ),
      panel('Сохранение настроек', 'Настройки сохраняются локально на этом компьютере.',
        el('button', { onClick: saveSettings, disabled: saving, style: style({ ...buttonStyle(true), width: '100%' }) }, saving ? 'СОХРАНЯЕМ…' : 'СОХРАНИТЬ НАСТРОЙКИ'),
        el('button', { onClick: resetSettings, style: style({ ...buttonStyle(false), width: '100%', marginTop: '9px' }) }, 'СБРОСИТЬ К НАЧАЛЬНЫМ')
      )
    ];
  }
  function render() {
    const pages = { overview: renderOverview, personality: renderPersonality, activity: renderActivity, notifications: renderNotifications, appearance: renderAppearance };
    const content = pages[activeTab]();
    const tree = el('div', { style: style({ maxWidth: '860px', margin: '0 auto', padding: settings.compact_ui ? '10px' : '18px', color: C.text, fontFamily: 'Segoe UI, Arial, sans-serif' }) },
      el('header', { style: style({ position: 'relative', overflow: 'hidden', padding: '23px', marginBottom: '14px', borderRadius: '20px', border: '1px solid rgba(174,113,255,.38)', background: 'radial-gradient(ellipse at 90% 0%,rgba(144,66,255,.28),transparent 48%),linear-gradient(135deg,#21143b,#100d1e 68%)', boxShadow: '0 0 32px rgba(126,55,222,.13)' }) },
        el('div', { style: { color: C.cyan, fontSize: '10px', letterSpacing: '3px', fontWeight: 800 } }, 'ASTRA · GAMING COMPANION'),
        el('div', { style: { fontSize: '30px', fontWeight: 950, letterSpacing: '1px', marginTop: '8px', textShadow: '0 0 20px #a855f766' } }, 'GAMEBUDDY ', el('span', { style: { color: C.purple } }, '✦')),
        el('div', { style: { color: '#c5b7df', fontSize: '12px', marginTop: '6px' } }, 'Твой напарник по играм. С характером.'),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '14px' } },
          el('span', { style: { color: dashboard.connected ? C.green : C.muted, fontSize: '11px', fontWeight: 700 } }, dashboard.connected ? '● STEAM ПОДКЛЮЧЁН' : '○ STEAM НЕ ПОДКЛЮЧЁН'),
          el('button', { onClick: saveSettings, disabled: saving, style: style({ ...buttonStyle(true), padding: '8px 12px', fontSize: '11px' }) }, saving ? 'СОХРАНЯЕМ…' : 'СОХРАНИТЬ ИЗМЕНЕНИЯ')
        ),
        el('div', { style: { position: 'absolute', right: '22px', top: '28px', fontSize: '40px', opacity: .8, filter: 'drop-shadow(0 0 14px #a855f7)' } }, '🎮')
      ),
      el('nav', { style: style({ display: 'flex', gap: '5px', overflowX: 'auto', padding: '5px', marginBottom: '14px', borderRadius: '14px', background: 'rgba(18,14,29,.85)', border: `1px solid ${C.border}` }) },
        tabButton('overview', 'Обзор', '◈'), tabButton('personality', 'Характер', '✦'), tabButton('activity', 'Игры', '🎮'), tabButton('notifications', 'Уведомления', '◉'), tabButton('appearance', 'Интерфейс', '⚙')
      ),
      ...content,
      el('footer', { style: { color: '#716783', fontSize: '10px', textAlign: 'center', padding: '10px 0 4px' } }, 'GAMEBUDDY · MADE FOR ASTRA WITH 💜')
    );
    if (root) root.render(tree); else root = ui.mount(container, tree);
  }
  async function loadSettings() {
    try {
      const response = await astra.callBackend('settings_data', {});
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      settings = { ...defaults, ...(data || {}) };
    } catch (error) { console.warn('GameBuddy settings:', error); }
  }
  async function saveSettings() {
    saving = true; render();
    try {
      const response = await astra.callBackend('save_settings_ui', { settings });
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      if (!data?.ok) throw new Error('save failed');
      settings = { ...defaults, ...(data.settings || settings) };
      dashboard.connectionMessage = 'Настройки успешно сохранены 💜';
    } catch (error) { dashboard.connectionMessage = 'Не удалось сохранить настройки.'; console.error(error); }
    finally { saving = false; render(); }
  }
  async function resetSettings() { settings = { ...defaults }; await saveSettings(); }
  async function connectSteam() {
    const code = dashboard.pairingCode.trim();
    if (!/^\d{8}$/.test(code)) { dashboard.connectionMessage = 'Нужен правильный восьмизначный код.'; render(); return; }
    dashboard.connecting = true; dashboard.connectionMessage = 'Подключаем Steam…'; render();
    try {
      const response = await astra.callBackend('connect_steam_ui', { code });
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      if (!data?.ok) throw new Error('pair failed');
      dashboard.pairingCode = ''; dashboard.connectionMessage = 'Steam успешно подключён!'; await loadDashboard();
    } catch (error) { dashboard.connectionMessage = 'Ошибка подключения. Проверь код и попробуй ещё раз.'; console.error(error); }
    finally { dashboard.connecting = false; render(); }
  }
  async function disconnectSteam() {
    if (!confirm('Отвязать Steam? Локальный токен GameBuddy будет удалён.')) return;
    try {
      const response = await astra.callBackend('disconnect_steam_ui', {});
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      if (!data?.ok) throw new Error('disconnect failed');
      dashboard.connectionMessage = 'Steam отвязан. Локальный токен удалён.';
      await loadDashboard();
    } catch (error) { dashboard.connectionMessage = 'Не удалось отвязать Steam.'; console.error(error); }
    render();
  }
  async function loadDashboard() {
    dashboard.loading = true; dashboard.error = ''; render();
    try {
      const response = await astra.callBackend('dashboard_data', {});
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      dashboard = { ...dashboard, loading: false, connected: data.connected === true, online: data.online === true,
        currentGame: data.currentGame || '', lastGame: data.lastGame || '', playtimeRecentMinutes: Number(data.playtimeRecentMinutes) || 0, error: '' };
    } catch (error) {
      dashboard.loading = false; dashboard.connected = false;
      dashboard.error = 'Не удалось получить данные Steam. Проверь подключение и токен.';
      console.error('GameBuddy dashboard:', error);
    }
    render();
  }
  await loadSettings();
  render();
  loadDashboard();
  window.addEventListener('pagehide', () => root?.unmount(), { once: true });
} catch (error) {
  container.textContent = 'Ошибка интерфейса: ' + error.message;
}
