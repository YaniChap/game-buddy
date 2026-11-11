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
  let settingsSaveTimer = null;
  let dashboard = {
    loading: true, connected: false, tokenPresent: false, online: false,
    currentGame: '', lastGame: '', playtimeRecentMinutes: 0, error: '',
    pairingCode: '', connectionMessage: '', connecting: false, disconnecting: false
  };

  const C = {
    bg: '#100d18', sidebar: '#171222', panel: '#1d1729', panelSoft: '#241b33',
    border: 'rgba(190,154,255,.13)', borderStrong: 'rgba(183,132,255,.32)',
    purple: '#b58aff', purpleDeep: '#8754d6', lavender: '#d7c2ff',
    text: '#f7f2ff', muted: '#a99db9', dim: '#776b88',
    green: '#72ddb2', red: '#ff829e', blue: '#8bcaff', gold: '#f4cc82'
  };
  const S = (x = {}) => ({ boxSizing: 'border-box', ...x });
  const el = (tag, props, ...children) => h(tag, props || {}, ...children.flat().filter(v => v !== null && v !== undefined && v !== false));
  const btn = (label, action, kind = 'soft', disabled = false, extra = {}) => {
    const variants = {
      primary: { background: 'linear-gradient(135deg,#a77af0,#7543c1)', border: '1px solid #b18af0', color: '#fff', boxShadow: '0 7px 22px rgba(130,78,205,.22)' },
      soft: { background: '#302440', border: `1px solid ${C.borderStrong}`, color: C.text },
      ghost: { background: 'transparent', border: `1px solid ${C.border}`, color: C.muted },
      danger: { background: 'rgba(255,105,139,.09)', border: '1px solid rgba(255,130,158,.34)', color: '#ff9db2' }
    };
    return el('button', {
      onClick: action, disabled,
      style: S({ minHeight: '39px', padding: '9px 14px', borderRadius: '12px', fontSize: '12px',
        fontWeight: 750, letterSpacing: '.1px', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .58 : 1, transition: 'background .15s ease', ...variants[kind], ...extra })
    }, label);
  };
  const pill = (label, color = C.purple) => el('span', { style: S({ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '99px', background: `${color}18`, border: `1px solid ${color}44`, color, fontSize: '10px', fontWeight: 800, letterSpacing: '.35px', whiteSpace: 'nowrap' }) }, label);
  const card = (title, subtitle, ...children) => el('section', { style: S({ minWidth: 0, background: `linear-gradient(155deg,${C.panel},#191421)`, border: `1px solid ${C.border}`, borderRadius: '18px', padding: settings.compact_ui ? '14px' : '18px', boxShadow: '0 12px 34px rgba(0,0,0,.16)' }) },
    el('div', { style: { marginBottom: '14px' } },
      el('div', { style: { color: C.text, fontSize: '14px', fontWeight: 850, letterSpacing: '.1px' } }, title),
      subtitle ? el('div', { style: { color: C.muted, fontSize: '11px', lineHeight: 1.5, marginTop: '5px' } }, subtitle) : null
    ), ...children);
  const field = (label, desc, control) => el('div', { style: S({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '12px 0', borderBottom: `1px solid rgba(255,255,255,.055)` }) },
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('div', { style: { color: C.text, fontSize: '12px', fontWeight: 700 } }, label),
      desc ? el('div', { style: { color: C.dim, fontSize: '10px', lineHeight: 1.45, marginTop: '4px' } }, desc) : null
    ), control);
  const select = (key, options, width = '148px') => el('select', {
    value: String(settings[key]),
    onChange: e => { settings[key] = e.target.value; render(); scheduleSettingsSave(); },
    style: S({ width, maxWidth: '48%', minHeight: '36px', padding: '7px 9px', borderRadius: '10px', background: '#171221', color: C.text, border: `1px solid ${C.borderStrong}`, fontSize: '11px' })
  }, ...options.map(([v, label]) => el('option', { value: v }, label)));
  const toggle = key => {
    const on = !!settings[key];
    return el('button', { onClick: () => { settings[key] = !settings[key]; render(); scheduleSettingsSave(); }, 'aria-label': key,
      style: S({ flexShrink: 0, width: '43px', height: '25px', borderRadius: '99px', padding: '3px', border: `1px solid ${on ? '#a984e8' : '#51465f'}`, background: on ? 'linear-gradient(90deg,#8050c8,#b58aff)' : '#393142', cursor: 'pointer', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', alignItems: 'center' }) },
      el('span', { style: { display: 'block', width: '17px', height: '17px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 5px #0008' } }));
  };
  const range = (key, min, max) => el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', width: '48%', minWidth: '120px' } },
    el('input', { type: 'range', min, max, value: settings[key], onInput: e => { settings[key] = Number(e.target.value); const out = e.target.parentNode.querySelector('span'); if (out) out.textContent = `${settings[key]}%`; scheduleSettingsSave(); }, style: { width: '100%', accentColor: C.purple } }),
    el('span', { style: { minWidth: '34px', color: C.lavender, fontSize: '11px', textAlign: 'right' } }, `${settings[key]}%`));
  const metric = (label, value, note, color = C.purple) => el('div', { style: S({ minWidth: 0, padding: '14px', borderRadius: '15px', background: `linear-gradient(145deg,${color}18,#1b1526 75%)`, border: `1px solid ${color}38` }) },
    el('div', { style: { color: C.muted, fontSize: '9px', fontWeight: 850, letterSpacing: '1.1px' } }, label),
    el('div', { style: { color, fontSize: '16px', fontWeight: 850, marginTop: '8px', overflowWrap: 'anywhere', lineHeight: 1.25 } }, value),
    note ? el('div', { style: { color: C.dim, fontSize: '10px', marginTop: '5px', lineHeight: 1.4 } }, note) : null);

  const tabs = [
    ['overview', 'Главная', '⌂'], ['personality', 'Характер', '✦'], ['activity', 'Игровой процесс', '◈'],
    ['notifications', 'Уведомления', '◉'], ['appearance', 'Настройки', '⚙']
  ];
  const titles = {
    overview: ['Твоя игровая станция', 'Состояние Steam, текущая игра и подключение аккаунта.'],
    personality: ['Характер компаньона', 'Настрой голос, настроение и стиль общения GameBuddy.'],
    activity: ['Игровая активность', 'Выбери, какие игровые события отслеживать и как на них реагировать.'],
    notifications: ['Уведомления', 'Контролируй сообщения компаньона и время тишины.'],
    appearance: ['Персонализация', 'Язык, плотность интерфейса и параметры отображения.']
  };

  function renderOverview() {
    const playtime = `${Math.floor(dashboard.playtimeRecentMinutes / 60)} ч ${dashboard.playtimeRecentMinutes % 60} мин`;
    const steamLabel = dashboard.loading ? 'Проверяем…' : dashboard.connected ? 'Подключён' : dashboard.tokenPresent ? 'Токен сохранён' : 'Не подключён';
    const steamColor = dashboard.connected ? C.green : dashboard.tokenPresent ? C.gold : C.red;
    return el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(245px,1fr))', gap: '13px' } },
      el('div', { style: { display: 'grid', gap: '13px', alignContent: 'start' } },
        card('Сейчас в игре', 'Данные активности Steam',
          el('div', { style: S({ minHeight: '118px', borderRadius: '15px', padding: '16px', background: 'radial-gradient(circle at 90% 0%,rgba(168,120,239,.2),transparent 45%),#171221', border: `1px solid ${C.border}` }) },
            el('div', { style: { fontSize: '27px', marginBottom: '12px' } }, '🎮'),
            el('div', { style: { color: C.text, fontSize: '17px', fontWeight: 850, overflowWrap: 'anywhere' } }, settings.streamer_mode ? 'Скрыто в режиме стримера' : dashboard.loading ? 'Загружаем игру…' : dashboard.currentGame || 'Сейчас не играешь'),
            el('div', { style: { color: C.muted, fontSize: '10px', marginTop: '6px' } }, dashboard.connected ? 'Steam синхронизирован с GameBuddy' : 'Подключи Steam, чтобы отслеживать сессии')
          ),
          el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' } },
            pill(dashboard.online ? '● В СЕТИ' : '○ НЕ В СЕТИ', dashboard.online ? C.green : C.dim),
            pill(`STEAM · ${steamLabel.toUpperCase()}`, steamColor)
          ),
          dashboard.error ? el('div', { style: { color: C.red, fontSize: '10px', marginTop: '10px', lineHeight: 1.5 } }, dashboard.error) : null,
          btn('↻  Обновить данные', loadDashboard, 'primary', dashboard.loading, { width: '100%', marginTop: '14px' })
        ),
        card('Игровая статистика', 'Недавняя активность аккаунта',
          el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px' } },
            metric('ЗА 14 ДНЕЙ', settings.streamer_mode ? '—' : dashboard.loading ? '…' : playtime, 'Время в играх', C.purple),
            metric('ПОСЛЕДНЯЯ ИГРА', settings.streamer_mode ? '—' : dashboard.lastGame || 'Нет данных', 'Последняя известная сессия', C.blue)
          )
        )
      ),
      el('div', { style: { display: 'grid', gap: '13px', alignContent: 'start' } },
        card('Подключение Steam', 'Привяжи аккаунт с помощью одноразового кода с сайта GameBuddy.',
          el('div', { style: { padding: '13px', borderRadius: '14px', background: '#171221', border: `1px solid ${C.border}` } },
            el('div', { style: { color: C.muted, fontSize: '9px', fontWeight: 850, letterSpacing: '1px', marginBottom: '8px' } }, 'КОД ПОДКЛЮЧЕНИЯ'),
            el('input', { id: 'gamebuddy-pairing-code', type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 8, placeholder: 'Введите 8 цифр',
              style: S({ width: '100%', padding: '12px', borderRadius: '10px', background: '#100d17', border: `1px solid ${C.borderStrong}`, color: C.text, fontSize: '16px', letterSpacing: '4px', textAlign: 'center', outline: 'none' }) })
          ),
          btn(dashboard.connecting ? 'Подключаем…' : 'Привязать Steam', connectSteam, 'primary', dashboard.connecting, { width: '100%', marginTop: '10px' }),
          el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '9px' } },
            btn('Открыть GameBuddy ↗', openWebsite, 'soft'),
            dashboard.tokenPresent ? btn(dashboard.disconnecting ? 'Отвязываем…' : 'Отвязать Steam', disconnectSteam, 'danger', dashboard.disconnecting) : null
          ),
          dashboard.connectionMessage ? el('div', { style: { color: dashboard.connectionMessage.toLowerCase().includes('ошиб') || dashboard.connectionMessage.toLowerCase().includes('не удалось') ? C.red : C.lavender, fontSize: '10px', lineHeight: 1.5, marginTop: '11px' } }, dashboard.connectionMessage) : null
        ),
        card('Твой компаньон', 'Текущий стиль общения GameBuddy',
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            el('div', { style: S({ width: '48px', height: '48px', borderRadius: '15px', display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg,#9c70df,#51327c)', fontSize: '24px', boxShadow: '0 7px 20px #8754d644' }) }, '✦'),
            el('div', { style: { flex: 1 } },
              el('div', { style: { color: C.text, fontSize: '13px', fontWeight: 850 } }, ({ playful: 'Дружелюбная', roaster: 'Roast-мастер', sarcastic: 'Саркастичная', coach: 'Тренер', hype: 'Хайп-комментатор', chill: 'Чилл' })[settings.personality] || 'Дружелюбная'),
              el('div', { style: { color: C.muted, fontSize: '10px', marginTop: '4px' } }, `Энергия ${settings.energy}% · Подколы ${settings.teasing}%`)
            ),
            btn('Изменить', () => { activeTab = 'personality'; render(); }, 'ghost')
          )
        )
      )
    );
  }

  function renderPersonality() {
    const personalities = [
      ['playful', '💜', 'Дружелюбная', 'Поддерживает, шутит и радуется вместе с тобой'],
      ['roaster', '🔥', 'Roast-мастер', 'Подкалывает за промахи, но остаётся на твоей стороне'],
      ['sarcastic', '😏', 'Саркастичная', 'Тонкий сарказм и острые комментарии'],
      ['coach', '🎯', 'Тренер', 'Тактика, спокойная поддержка и разбор ошибок'],
      ['hype', '⚡', 'Хайп-комментатор', 'Максимум эмоций на победах и достижениях'],
      ['chill', '🌙', 'Чилл', 'Спокойное общение без лишнего шума']
    ];
    return el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(235px,1fr))', gap: '13px' } },
      card('Выбери личность', 'Переключай стиль компаньона в любой момент.',
        ...personalities.map(([value, emoji, title, desc]) => el('button', { onClick: () => { settings.personality = value; render(); scheduleSettingsSave(); },
          style: S({ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', padding: '12px', marginBottom: '8px', textAlign: 'left', borderRadius: '13px', border: `1px solid ${settings.personality === value ? C.purple : C.border}`, background: settings.personality === value ? 'rgba(157,111,224,.16)' : '#191421', color: C.text, cursor: 'pointer' }) },
          el('div', { style: { fontSize: '22px', width: '30px', textAlign: 'center' } }, emoji),
          el('div', { style: { flex: 1 } }, el('div', { style: { fontSize: '12px', fontWeight: 850 } }, title), el('div', { style: { color: C.muted, fontSize: '10px', lineHeight: 1.4, marginTop: '4px' } }, desc)),
          el('span', { style: { color: settings.personality === value ? C.purple : C.dim, fontSize: '16px' } }, settings.personality === value ? '●' : '○')
        ))
      ),
      card('Тон общения', 'Подстрой эмоциональность и объём ответов.',
        field('Острота подколов', 'От мягких шуток до дружеской прожарки.', range('teasing', 0, 100)),
        field('Энергичность', 'Насколько ярко Астра реагирует на игровые события.', range('energy', 0, 100)),
        field('Длина ответов', 'Насколько подробными будут советы и комментарии.', select('verbosity', [['short','Коротко'],['balanced','Сбалансированно'],['detailed','Подробно']]))
      )
    );
  }

  function renderActivity() {
    return el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(245px,1fr))', gap: '13px' } },
      card('Отслеживание сессий', 'Какие игровые события замечает GameBuddy.',
        field('Отслеживать игровые сессии', 'Начало, смена и завершение игры.', toggle('track_sessions')),
        field('Старт игры', 'Поздороваться, когда ты запускаешь игру.', toggle('game_started')),
        field('Завершение игры', 'Подвести итоги после игровой сессии.', toggle('game_ended')),
        field('Достижения', 'Реагировать на полученные достижения.', toggle('achievements')),
        field('Частота проверки Steam', 'Как часто проверять текущую игру.', select('poll_interval', [['15','15 секунд'],['30','30 секунд'],['60','1 минута'],['120','2 минуты'],['300','5 минут']]))
      ),
      card('Игровой помощник', 'Настрой подсказки и личные границы.',
        field('Автоматические советы', 'Предлагать тактику и подсказки по ситуации.', toggle('auto_tips')),
        field('Запоминать моменты', 'Сохранять победы, фейлы и заметки сессии.', toggle('remember_moments')),
        field('Не спойлерить', 'Не раскрывать сюжетные повороты без просьбы.', toggle('spoilers')),
        field('Не отвлекать во время матча', 'Снизить вмешательство во время игры.', toggle('backseat')),
        field('Отчёты по сессиям', 'Формировать итоги и цели на следующий заход.', toggle('session_reports'))
      )
    );
  }

  function renderNotifications() {
    return el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(245px,1fr))', gap: '13px' } },
      card('Уведомления компаньона', 'Управляй тем, когда GameBuddy может писать первым.',
        field('Игровые уведомления', 'Главный переключатель автоматических сообщений.', toggle('notifications')),
        field('Тихие часы', 'Не отправлять автоматические сообщения в выбранный период.', toggle('quiet_hours')),
        field('Начало тишины', 'Локальное время устройства.', el('input', { type: 'time', value: settings.quiet_start, onChange: e => { settings.quiet_start = e.target.value; scheduleSettingsSave(); }, style: S({ padding: '8px', borderRadius: '9px', background: '#171221', border: `1px solid ${C.borderStrong}`, color: C.text }) })),
        field('Конец тишины', 'Когда снова можно отправлять сообщения.', el('input', { type: 'time', value: settings.quiet_end, onChange: e => { settings.quiet_end = e.target.value; scheduleSettingsSave(); }, style: S({ padding: '8px', borderRadius: '9px', background: '#171221', border: `1px solid ${C.borderStrong}`, color: C.text }) }))
      ),
      card('Как это работает', 'Твои настройки влияют на автоматические игровые сообщения.',
        el('div', { style: { padding: '13px', borderRadius: '13px', background: '#171221', border: `1px solid ${C.border}` } },
          el('div', { style: { color: C.lavender, fontSize: '12px', fontWeight: 800, marginBottom: '6px' } }, '🌙 Режим тишины'),
          el('div', { style: { color: C.muted, fontSize: '10px', lineHeight: 1.6 } }, `Сейчас ${settings.quiet_hours ? `включён: ${settings.quiet_start} — ${settings.quiet_end}` : 'выключен'}. Настрой период, когда компаньон не должен отвлекать тебя.`)
        )
      )
    );
  }

  function renderAppearance() {
    return el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(245px,1fr))', gap: '13px' } },
      card('Язык и интерфейс', 'Персонализируй внешний вид GameBuddy.',
        field('Язык Астры', 'Автоматически или вручную.', select('language', [['auto','Авто'],['ru','Русский'],['en','English']])),
        field('Показывать онлайн-статус', 'Отображать статус Steam на главной.', toggle('show_online')),
        field('Компактный интерфейс', 'Уменьшить отступы и плотность карточек.', toggle('compact_ui')),
        field('Режим стримера', 'Скрывать названия игр и игровую статистику.', toggle('streamer_mode'))
      ),
      card('Сохранение', 'Изменения сохраняются на этом компьютере.',
        el('div', { style: { color: C.muted, fontSize: '10px', lineHeight: 1.6, marginBottom: '13px' } }, 'Большинство переключателей сохраняются автоматически. Также можно принудительно сохранить все параметры.'),
        btn(saving ? 'Сохраняем…' : 'Сохранить настройки', saveSettings, 'primary', saving, { width: '100%' }),
        btn('Сбросить настройки', resetSettings, 'ghost', saving, { width: '100%', marginTop: '8px' })
      )
    );
  }

  function render() {
    const [pageTitle, pageSubtitle] = titles[activeTab] || titles.overview;
    const page = ({ overview: renderOverview, personality: renderPersonality, activity: renderActivity, notifications: renderNotifications, appearance: renderAppearance })[activeTab]();
    const statusColor = dashboard.connected ? C.green : dashboard.tokenPresent ? C.gold : C.dim;

    const sidebar = el('aside', { style: S({ width: '204px', flexShrink: 0, padding: '16px 12px', borderRadius: '19px', background: 'linear-gradient(180deg,#1c1628,#17121f)', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '7px' }) },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 7px 17px' } },
        el('div', { style: S({ width: '39px', height: '39px', borderRadius: '13px', display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg,#b58aff,#67419c)', color: '#fff', fontSize: '20px', boxShadow: '0 6px 18px #8754d644' }) }, '✦'),
        el('div', {}, el('div', { style: { color: C.text, fontSize: '13px', fontWeight: 950, letterSpacing: '.5px' } }, 'GAMEBUDDY'), el('div', { style: { color: C.dim, fontSize: '9px', marginTop: '3px', letterSpacing: '.7px' } }, 'YOUR GAME COMPANION'))
      ),
      el('div', { style: { color: C.dim, fontSize: '9px', fontWeight: 850, letterSpacing: '1.2px', padding: '4px 9px 5px' } }, 'РАЗДЕЛЫ'),
      ...tabs.map(([id, label, icon]) => el('button', { onClick: () => { activeTab = id; render(); }, style: S({ width: '100%', display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 10px', borderRadius: '11px', border: `1px solid ${activeTab === id ? 'rgba(181,138,255,.28)' : 'transparent'}`, background: activeTab === id ? 'linear-gradient(100deg,rgba(153,106,219,.23),rgba(153,106,219,.08))' : 'transparent', color: activeTab === id ? C.text : C.muted, textAlign: 'left', fontSize: '11px', fontWeight: activeTab === id ? 850 : 650, cursor: 'pointer' }) },
        el('span', { style: { width: '19px', textAlign: 'center', fontSize: '15px', color: activeTab === id ? C.purple : C.dim } }, icon), label,
        activeTab === id ? el('span', { style: { marginLeft: 'auto', color: C.purple } }, '•') : null
      )),
      el('div', { style: { flex: 1, minHeight: '12px' } }),
      el('div', { style: { padding: '12px 10px', borderRadius: '13px', background: '#120f19', border: `1px solid ${C.border}` } },
        el('div', { style: { color: C.dim, fontSize: '9px', letterSpacing: '.8px', fontWeight: 850 } }, 'STEAM CONNECTION'),
        el('div', { style: { color: statusColor, fontSize: '11px', fontWeight: 800, marginTop: '7px' } }, dashboard.connected ? '● Подключён' : dashboard.tokenPresent ? '● Токен сохранён' : '○ Не подключён'),
        el('div', { style: { color: C.dim, fontSize: '9px', marginTop: '5px' } }, dashboard.online ? 'Аккаунт в сети' : 'Ожидание активности')
      )
    );

    const main = el('main', { style: S({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '15px' }) },
      el('header', { style: S({ position: 'relative', overflow: 'hidden', padding: '20px 22px', borderRadius: '19px', background: 'radial-gradient(ellipse at 95% 0%,rgba(159,111,224,.25),transparent 42%),linear-gradient(120deg,#2a2039,#1b1525 65%)', border: `1px solid ${C.borderStrong}` }) },
        el('div', { style: { position: 'absolute', right: '24px', top: '8px', fontSize: '55px', opacity: .13, pointerEvents: 'none' } }, '🎮'),
        el('div', { style: { color: C.purple, fontSize: '9px', fontWeight: 900, letterSpacing: '1.8px' } }, 'ASTRA  /  GAME COMPANION'),
        el('div', { style: { color: C.text, fontSize: '23px', fontWeight: 950, letterSpacing: '-.5px', marginTop: '8px' } }, pageTitle),
        el('div', { style: { color: C.muted, fontSize: '11px', lineHeight: 1.5, marginTop: '5px', maxWidth: '520px' } }, pageSubtitle),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap', marginTop: '14px' } },
          pill(dashboard.connected ? '● STEAM ПОДКЛЮЧЁН' : dashboard.tokenPresent ? '● ТОКЕН СОХРАНЁН' : '○ STEAM НЕ ПОДКЛЮЧЁН', statusColor),
          dashboard.connectionMessage ? el('span', { style: { color: C.lavender, fontSize: '10px' } }, dashboard.connectionMessage) : null,
          el('span', { style: { marginLeft: 'auto' } }, btn(saving ? 'Сохраняем…' : 'Сохранить', saveSettings, 'soft', saving, { minHeight: '32px', padding: '6px 11px', fontSize: '10px' }))
        )
      ),
      page,
      el('footer', { style: { color: C.dim, textAlign: 'center', fontSize: '9px', letterSpacing: '.7px', padding: '3px 0 8px' } }, 'GAMEBUDDY  ·  MADE FOR ASTRA WITH PURPLE HEART')
    );

    const tree = el('div', { style: S({ width: '100%', maxWidth: '1120px', margin: '0 auto', padding: settings.compact_ui ? '10px' : '17px', color: C.text, background: `radial-gradient(ellipse at 10% 0%,rgba(115,74,160,.11),transparent 35%),${C.bg}`, fontFamily: 'Inter, Segoe UI, Arial, sans-serif', minHeight: '100%', display: 'flex', gap: '14px', alignItems: 'stretch' }) },
      sidebar, main
    );
    if (root) root.render(tree); else root = ui.mount(container, tree);
  }

  // Delegate native input events from the UI container. This survives UI rerenders.
  container.addEventListener('input', event => {
    const input = event.target;
    if (!input || input.id !== 'gamebuddy-pairing-code') return;
    const clean = String(input.value ?? '').replace(/[^0-9]/g, '').slice(0, 8);
    dashboard.pairingCode = clean;
    if (input.value !== clean) input.value = clean;
  });
  container.addEventListener('change', event => {
    const input = event.target;
    if (!input || input.id !== 'gamebuddy-pairing-code') return;
    const clean = String(input.value ?? '').replace(/[^0-9]/g, '').slice(0, 8);
    dashboard.pairingCode = clean;
    if (input.value !== clean) input.value = clean;
  });

  async function loadSettings() {
    try {
      const response = await astra.callBackend('settings_data', {});
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      settings = { ...defaults, ...(data || {}) };
    } catch (error) { console.warn('GameBuddy settings:', error); }
  }

  async function saveSettings() {
    if (settingsSaveTimer) { clearTimeout(settingsSaveTimer); settingsSaveTimer = null; }
    const snapshot = { ...settings };
    saving = true; render();
    try {
      const response = await astra.callBackend('save_settings_ui', { settings: snapshot });
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      if (!data?.ok) throw new Error('Settings were not saved');
      dashboard.connectionMessage = 'Настройки сохранены';
    } catch (error) {
      dashboard.connectionMessage = 'Не удалось сохранить настройки';
      console.error('GameBuddy settings save:', error);
    } finally { saving = false; render(); }
  }

  function scheduleSettingsSave() {
    if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(() => { settingsSaveTimer = null; if (!saving) saveSettings(); }, 700);
  }

  async function resetSettings() {
    settings = { ...defaults };
    render();
    await saveSettings();
  }

  async function openWebsite() {
    try {
      const response = await astra.callBackend('open_website', {});
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      if (data && data.ok === false) throw new Error('Website could not be opened');
    } catch (error) {
      dashboard.connectionMessage = 'Не удалось открыть сайт GameBuddy';
      console.error('GameBuddy website:', error);
      render();
    }
  }

  async function connectSteam() {
    const pairingInput = container.querySelector('#gamebuddy-pairing-code');
    const code = String(pairingInput?.value ?? dashboard.pairingCode).replace(/[^0-9]/g, '').slice(0, 8);
    dashboard.pairingCode = code;
    if (!/^\d{8}$/.test(code)) {
      dashboard.connectionMessage = 'Введи корректный код из 8 цифр';
      render();
      return;
    }
    dashboard.connecting = true;
    dashboard.connectionMessage = 'Подключаем Steam…';
    render();
    try {
      const response = await astra.callBackend('connect_steam_ui', { code });
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      if (!data?.ok) throw new Error(data?.error || 'Pairing failed');
      dashboard.pairingCode = '';
      const pairingInputAfterConnect = container.querySelector('#gamebuddy-pairing-code');
      if (pairingInputAfterConnect) pairingInputAfterConnect.value = '';
      dashboard.connectionMessage = 'Steam успешно подключён';
      await loadDashboard();
    } catch (error) {
      dashboard.connectionMessage = `Ошибка подключения: ${error?.message || String(error)}`;
      console.error('GameBuddy connect:', error);
    } finally { dashboard.connecting = false; render(); }
  }

  async function disconnectSteam() {
    if (dashboard.disconnecting) return;
    dashboard.disconnecting = true;
    dashboard.connectionMessage = 'Удаляем локальный токен Steam…';
    render();
    try {
      const response = await astra.callBackend('disconnect_steam_ui', {});
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      if (!data?.ok || data.tokenPresent !== false) throw new Error(data?.error || 'Сервер не подтвердил удаление токена');
      dashboard.tokenPresent = false;
      dashboard.connected = false;
      dashboard.online = false;
      dashboard.currentGame = '';
      dashboard.lastGame = '';
      dashboard.playtimeRecentMinutes = 0;
      dashboard.error = '';
      dashboard.connectionMessage = 'Steam отвязан. Локальный токен удалён.';
      render();
      await loadDashboard();
      dashboard.connectionMessage = 'Steam отвязан. Локальный токен удалён.';
    } catch (error) {
      dashboard.connectionMessage = `Не удалось отвязать Steam: ${error?.message || String(error)}`;
      console.error('GameBuddy disconnect:', error);
      await loadDashboard();
    } finally { dashboard.disconnecting = false; render(); }
  }

  async function loadDashboard() {
    dashboard.loading = true;
    dashboard.error = '';
    render();
    try {
      const response = await astra.callBackend('dashboard_data', {});
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      dashboard = {
        ...dashboard,
        loading: false,
        connected: data.connected === true,
        tokenPresent: data.tokenPresent === true || data.connected === true,
        online: data.online === true,
        currentGame: data.currentGame || '',
        lastGame: data.lastGame || '',
        playtimeRecentMinutes: Number(data.playtimeRecentMinutes) || 0,
        error: data.error || ''
      };
    } catch (error) {
      dashboard.loading = false;
      dashboard.connected = false;
      dashboard.error = 'Не удалось получить данные Steam. Сохранённый токен можно отвязать.';
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
