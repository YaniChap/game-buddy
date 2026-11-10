
const container = document.getElementById('app');

try {
  const ui = await astra.loadUi({ apiVersion: 1 });
  const { h } = ui;
  let root;

  let dashboard = {
pairingCode: '',
connecting: false,
connectionMessage: '',
    loading: true,
    connected: false,
    online: false,
    currentGame: '',
    lastGame: '',
    playtimeRecentMinutes: 0,
    error: ''
  };

  function card(title, value, accent) {
    return h('div', {
      style: {
        padding: '18px',
        borderRadius: '14px',
        background: 'rgba(25,20,48,0.95)',
        border: `1px solid ${accent}`,
        boxShadow: `0 0 12px ${accent}33`
      }
    },
      h('div', {
        style: {
          color: '#aaa0c8',
          fontSize: '11px',
          letterSpacing: '1px',
          marginBottom: '10px'
        }
      }, title),
      h('div', {
        style: {
          color: accent,
          fontSize: '17px',
          fontWeight: 'bold',
          overflowWrap: 'anywhere'
        }
      }, value)
    );
  }

  function render() {
    const status = dashboard.loading
      ? 'Проверяем...'
      : dashboard.connected
        ? 'Подключён'
        : 'Не подключён';

    const playtime = `${Math.floor(dashboard.playtimeRecentMinutes / 60)} ч. ${dashboard.playtimeRecentMinutes % 60} мин.`;

    const tree = h('div', {
      style: {
        maxWidth: '620px',
        margin: '0 auto',
        padding: '20px',
        color: '#f4efff',
        fontFamily: 'Segoe UI, Arial, sans-serif'
      }
    },
      h('div', {
        style: {
          padding: '24px',
          borderRadius: '20px',
          border: '1px solid rgba(168,85,247,0.45)',
          background: 'linear-gradient(145deg, #231241, #0c0f23)',
          boxShadow: '0 0 25px rgba(145,60,255,0.2)'
        }
      },
        h('div', {
          style: {
            color: '#42e8ff',
            fontSize: '12px',
            letterSpacing: '3px'
          }
        }, 'YOUR GAMING COMPANION'),

        h('h1', {
          style: {
            fontSize: '34px',
            margin: '12px 0',
            color: '#fff',
            textShadow: '0 0 15px #a855f7'
          }
        }, 'GAMEBUDDY'),

        h('p', {
          style: { color: '#c5b8e8', lineHeight: '1.6' }
        }, 'Твой игровой помощник. Твоя статистика. Твои приключения.'),

        h('div', {
          style: {
            margin: '22px 0',
            padding: '16px',
            borderRadius: '14px',
            background: '#15152b',
            border: '1px solid rgba(66,232,255,0.4)'
          }
        },
          h('div', {
            style: { color: '#aaa0c8', fontSize: '11px' }
          }, 'STEAM ACCOUNT'),

          h('div', {
            style: {
              marginTop: '8px',
              fontSize: '19px',
              fontWeight: 'bold',
              color: dashboard.connected ? '#35d99a' : '#ff6688'
            }
          }, status),

          h('div', {
            style: { color: '#aaa0c8', fontSize: '12px', marginTop: '6px' }
          }, dashboard.online ? 'Сейчас онлайн' : 'Не отображается онлайн')
        ),

h('div', {
  style: {
    margin: '20px 0',
    padding: '16px',
    borderRadius: '14px',
    background: '#15152b',
    border: '1px solid rgba(183,107,255,0.5)'
  }
},
  h('div', {
    style: {
      color: '#42e8ff',
      fontSize: '12px',
      letterSpacing: '1px',
      marginBottom: '10px'
    }
  }, 'ПОДКЛЮЧЕНИЕ STEAM'),

h(ui.Input, {
  value: dashboard.pairingCode,
  placeholder: 'Введи 8-значный код',
  onChange: (value) => {
    dashboard.pairingCode = String(value)
      .replace(/\D/g, '')
      .slice(0, 8);
    render();
  }
}),

  h('button', {
    onClick: connectSteam,
    disabled: dashboard.connecting,
    style: {
      width: '100%',
      marginTop: '10px',
      padding: '14px',
      border: '1px solid #42e8ff',
      borderRadius: '10px',
      background: 'linear-gradient(90deg, #812cff, #542bdb)',
      color: 'white',
      fontWeight: 'bold',
      cursor: 'pointer'
    }
  }, dashboard.connecting ? 'ПОДКЛЮЧАЕМ...' : 'ПОДКЛЮЧИТЬ STEAM'),

h('button', {
  onClick: async () => {
    try {
      await astra.callBackend('open_website', {});
    } catch (error) {
      console.error('Не удалось открыть сайт:', error);
    }
  },
  style: {
    width: '100%',
    marginTop: '10px',
    padding: '14px',
    border: '1px solid #b76bff',
    borderRadius: '12px',
    background: '#211438',
    color: '#e8d5ff',
    fontWeight: 'bold',
    cursor: 'pointer'
  }
}, 'ОТКРЫТЬ САЙТ GAMEBUDDY ↗'),

  dashboard.connectionMessage
    ? h('p', {
        style: {
          color: '#42e8ff',
          fontSize: '13px',
          marginBottom: '0'
        }
      }, dashboard.connectionMessage)
    : null
),

        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '20px'
          }
        },
          card(
            'ПОСЛЕДНЯЯ ИГРА',
            dashboard.loading ? 'Загрузка...' : dashboard.lastGame || 'Нет данных',
            '#b66bff'
          ),
          card(
            'ВРЕМЯ ЗА 2 НЕДЕЛИ',
            dashboard.loading ? 'Загрузка...' : playtime,
            '#42e8ff'
          )
        ),

        card(
          'СЕЙЧАС ИГРАЕШЬ',
          dashboard.loading ? 'Проверяем...' : dashboard.currentGame || 'Сейчас не играешь',
          '#35d99a'
        ),

        dashboard.error
          ? h('p', {
              style: { color: '#ff8099', fontSize: '13px' }
            }, dashboard.error)
          : null,

        h('button', {
          onClick: loadDashboard,
          style: {
            width: '100%',
            marginTop: '18px',
            padding: '14px',
            border: '1px solid #42e8ff',
            borderRadius: '12px',
            background: 'linear-gradient(90deg, #812cff, #542bdb)',
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer'
          }
        }, '↻ ОБНОВИТЬ СТАТИСТИКУ'),
      )
    );

    if (root) {
      root.render(tree);
    } else {
      root = ui.mount(container, tree);
    }
  }

async function connectSteam() {
  const code = dashboard.pairingCode.trim();

  if (!/^\d{8}$/.test(code)) {
    dashboard.connectionMessage = 'Введи правильный восьмизначный код.';
    render();
    return;
  }

  dashboard.connecting = true;
  dashboard.connectionMessage = 'Подключаем Steam...';
  render();

  try {
    const response = await astra.callBackend('connect_steam_ui', {
      code: code
    });

    const data = typeof response === 'string'
      ? JSON.parse(response)
      : response;

    if (!data || data.ok !== true) {
      throw new Error('Не удалось подтвердить подключение.');
    }

    dashboard.pairingCode = '';
    dashboard.connectionMessage = 'Steam успешно подключён!';
    await loadDashboard();
  } catch (error) {
    dashboard.connectionMessage =
      'Ошибка подключения. Проверь код и попробуй ещё раз.';
    console.error('GameBuddy Steam connection:', error);
  } finally {
    dashboard.connecting = false;
    render();
  }
}

  async function loadDashboard() {
    dashboard.loading = true;
    dashboard.error = '';
    render();

    try {
      const response = await astra.callBackend('dashboard_data', {});
      const data = typeof response === 'string'
        ? JSON.parse(response)
        : response;

      dashboard = {
        loading: false,
        connected: data.connected === true,
        online: data.online === true,
        currentGame: data.currentGame || '',
        lastGame: data.lastGame || '',
        playtimeRecentMinutes: Number(data.playtimeRecentMinutes) || 0,
        error: ''
      };
    } catch (error) {
      dashboard.loading = false;
      dashboard.connected = false;
      dashboard.error = 'Не удалось получить данные Steam. Проверь подключение и токен в настройках плагина.';
      console.error('GameBuddy dashboard:', error);
    }

    render();
  }

  render();
  loadDashboard();

  window.addEventListener(
    'pagehide',
    () => root?.unmount(),
    { once: true }
  );
} catch (error) {
  container.textContent = 'Ошибка интерфейса: ' + error.message;
}
