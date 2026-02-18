if (typeof browser !== "undefined" && typeof chrome === "undefined") {
    window.chrome = browser;
}

(function () {
  let config = {
    deepLKey: null,
    useTrans: true,
    mode: true,
    mainLang: 'original',
    subLang: 'en',
    uiLang: 'ja'
  };

const TEXTS = {
    ja: {
      unit_hour: "時間",
      unit_minute: "分",
      unit_second: "秒",
      replay_playTime: "総再生時間",
      replay_plays: "回再生",
      replay_topSong: "トップソング",
      replay_topArtist: "トップアーティスト",
      replay_obsession: "ヘビロテ中",
      replay_ranking: "再生数ランキング",
      replay_today: "今日",
      replay_week: "今週",
      replay_all: "全期間",
      replay_empty: "まだ再生データがありません...",
      replay_no_data_sub: "曲を聴くとここに表示されます",
      replay_reset_confirm: "本当に再生履歴を全て削除しますか？\nこの操作は取り消せません。",
      
      replay_vibe: "あなたの雰囲気",
      replay_lyrics_heard: "累計行数",
      
      settings_title: "設定",
      settings_ui_lang: "UI言語 / Language",
      settings_trans: "歌詞翻訳機能を使う",
      settings_main_lang: "メイン言語 (大きく表示)",
      settings_sub_lang: "サブ言語 (小さく表示)",
      settings_save: "保存",
      settings_reset: "リセット",
      settings_saved: "設定を保存しました"
    },
    en: {
      unit_hour: "h",
      unit_minute: "m",
      unit_second: "s",
      replay_playTime: "Play Time",
      replay_plays: "plays",
      replay_topSong: "Top Song",
      replay_topArtist: "Top Artist",
      replay_obsession: "Most obsession",
      replay_ranking: "Top Songs",
      replay_today: "Today",
      replay_week: "This Week",
      replay_all: "All Time",
      replay_empty: "No music played yet...",
      replay_no_data_sub: "Play some music to see stats",
      replay_reset_confirm: "Are you sure you want to clear all history?\nThis cannot be undone.",

      replay_vibe: "Your Vibe",
      replay_lyrics_heard: "Lyrics Heard",
      
      settings_title: "Settings",
      settings_ui_lang: "UI Language",
      settings_trans: "Use Translation",
      settings_main_lang: "Main language",
      settings_sub_lang: "Sub language",
      settings_save: "Save",
      settings_reset: "Reset",
      settings_saved: "Saved"
    }
  };

  const t = (key) => {
    const lang = config.uiLang || 'ja';
    return TEXTS[lang][key] || TEXTS['en'][key] || key;
  };

  const NO_LYRICS_SENTINEL = '__NO_LYRICS__';

  let currentKey = null;
  let lyricsData = [];
  let hasTimestamp = false;
  let dynamicLines = null;
  let lyricsCandidates = null;
  let selectedCandidateId = null;
  let lastActiveIndex = -1;
  let lastTimeForChars = -1;
  let lyricRafId = null;

  let shareMode = false;
  let shareStartIndex = null;
  let shareEndIndex = null;
  let isFallbackLyrics = false;

  let lyricsRequests = null;
  let lyricsConfig = null;

  const ui = {
    bg: null,
    wrapper: null,
    title: null, artist: null, artwork: null,
    lyrics: null, input: null, settings: null,
    btnArea: null, uploadMenu: null, deleteDialog: null,
    replayPanel: null,
    queuePanel: null,
    settingsBtn: null,
    lyricsBtn: null,
    shareBtn: null
  };

  let hideTimer = null;
  let uploadMenuGlobalSetup = false;
  let deleteDialogGlobalSetup = false;
  let settingsOutsideClickSetup = false;
  let toastTimer = null;

  const debouncedSyncQueue = debounce(() => {
    if (ui.queuePanel?.classList.contains('visible')) {
      QueueManager.syncQueue();
    }
  }, 300); 

  const handleInteraction = () => {
    if (!ui.btnArea) return;
    ui.btnArea.classList.remove('inactive');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const isSettingsActive = ui.settings?.classList.contains('active');
      const isReplayActive = ui.replayPanel?.classList.contains('active');
      const isQueueActive = ui.queuePanel?.matches(':hover');
      if (!isSettingsActive && !isReplayActive && !isQueueActive && !ui.btnArea.matches(':hover')) {
        ui.btnArea.classList.add('inactive');
      }
    }, 3000);
  };

  const storage = {
    _api: chrome?.storage?.local,
    get: (k) => new Promise(r => {
      if (!storage._api) return r(null);
      storage._api.get([k], res => r(res[k] || null));
    }),
    set: (k, v) => { if (storage._api) storage._api.set({ [k]: v }); },
    remove: (k) => { if (storage._api) storage._api.remove(k); },
    clear: () => confirm('全データを削除しますか？') && storage._api?.clear(() => location.reload())
  };

  const ReplayManager = {
    HISTORY_KEY: 'ytm_local_history',
    currentVideoId: null,
    hasRecordedCurrent: false,
    currentPlayTime: 0,
    lastSaveTime: 0,
    
    currentLyricLines: 0,
    recordedLyricLines: 0, 

    formatDuration: function (seconds) {
      if (!seconds) return `0${t('unit_second')}`;
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const uH = t('unit_hour');
      const uM = t('unit_minute');
      const uS = t('unit_second');
      const sp = config.uiLang === 'ja' ? '' : ' ';
      if (h > 0) return `${h}${uH}${sp}${m}${uM}${sp}${s}${uS}`;
      if (m > 0) return `${m}${uM}${sp}${s}${uS}`;
      return `${s}${uS}`;
    },

    incrementLyricCount: function() {
        this.currentLyricLines++;
    },

    exportHistory: async function() {
        const history = await storage.get(this.HISTORY_KEY) || [];
        if (history.length === 0) {
            alert('保存する履歴データがありません。');
            return;
        }
        const blob = new Blob([JSON.stringify(history, null, 2)], {type : 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `ytm_history_${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importHistory: function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (Array.isArray(data)) {
                        if(confirm('履歴を復元しますか？\n[OK] 現在の履歴に結合 (マージ)\n[キャンセル] キャンセル')) {
                             const current = await storage.get(this.HISTORY_KEY) || [];
                             const existingIds = new Set(current.map(i => i.id + '_' + i.timestamp));
                             const newData = data.filter(i => !existingIds.has(i.id + '_' + i.timestamp));
                             const merged = current.concat(newData);
                             merged.sort((a,b) => a.timestamp - b.timestamp);
                             await storage.set(this.HISTORY_KEY, merged);
                             alert('履歴を復元しました！');
                             this.renderUI();
                        }
                    } else {
                        alert('無効なファイル形式です。');
                    }
                } catch(err) {
                    console.error(err);
                    alert('ファイルの読み込みに失敗しました。');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    check: async function () {
      const video = document.querySelector('video');
      if (!video) return;
      const vid = getCurrentVideoId();
      if (!vid) return;
      
      if (vid !== this.currentVideoId) {
        this.currentVideoId = vid;
        this.hasRecordedCurrent = false;
        this.currentPlayTime = 0;
        this.lastSaveTime = 0;
        this.currentLyricLines = 0;
        this.recordedLyricLines = 0;
        return;
      }

      if (!video.paused) {
        this.currentPlayTime++;
        const isPlayed = this.currentPlayTime > 30 || (video.duration > 10 && this.currentPlayTime / video.duration > 0.4);
        
        if (isPlayed) {
          if (!this.hasRecordedCurrent) {
            await this.recordNewPlay();
            this.hasRecordedCurrent = true;
          } else if (this.currentPlayTime - this.lastSaveTime >= 5) {
            await this.updateDuration();
            this.lastSaveTime = this.currentPlayTime;
          }
        }
      }
    },

    recordNewPlay: async function () {
      const meta = getMetadata();
      if (!meta) return;
      
      this.recordedLyricLines = this.currentLyricLines;

      const record = {
        id: this.currentVideoId,
        title: meta.title,
        artist: meta.artist,
        src: meta.src,
        duration: this.currentPlayTime,
        lyricLines: this.currentLyricLines,
        timestamp: Date.now()
      };
      
      let history = await storage.get(this.HISTORY_KEY) || [];
      if (history.length > 10000) history = history.slice(-10000);
      history.push(record);
      await storage.set(this.HISTORY_KEY, history);
      
      if (ui.replayPanel && ui.replayPanel.classList.contains('active')) {
        this.renderUI();
      }
    },

    updateDuration: async function () {
      let history = await storage.get(this.HISTORY_KEY) || [];
      if (history.length === 0) return;
      
      const lastIndex = history.length - 1;
      if (history[lastIndex].id === this.currentVideoId) {
        history[lastIndex].duration = this.currentPlayTime;
        history[lastIndex].lyricLines = this.currentLyricLines;
        
        await storage.set(this.HISTORY_KEY, history);
        if (ui.replayPanel && ui.replayPanel.classList.contains('active')) {
          this.renderUI();
        }
      }
    },

    getStats: async function (range = 'day') {
      const history = await storage.get(this.HISTORY_KEY) || [];
      const now = Date.now();
      let threshold = 0;
      if (range === 'day') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        threshold = today.getTime();
      } else if (range === 'week') {
        threshold = now - (7 * 24 * 60 * 60 * 1000);
      }
      
      const filtered = history.filter(h => h.timestamp >= threshold);
      
      const countMap = {};
      const artistMap = {};
      const uniqueArtists = new Set();
      let totalSeconds = 0;
      let totalLyrics = 0;
      const hourCounts = new Array(24).fill(0);

      filtered.forEach(h => {
        const key = h.title + '///' + h.artist;
        if (!countMap[key]) countMap[key] = { ...h, count: 0, totalDuration: 0 };
        
        countMap[key].count++;
        const duration = typeof h.duration === 'number' ? h.duration : 0;
        countMap[key].totalDuration += duration;
        
        if (!artistMap[h.artist]) {
            artistMap[h.artist] = { count: 0, src: h.src }; 
        } else {
            artistMap[h.artist].count++;
            if (h.src) artistMap[h.artist].src = h.src;
        }
        
        uniqueArtists.add(h.artist);
        totalSeconds += duration;
        
        if (h.lyricLines && typeof h.lyricLines === 'number') {
            totalLyrics += h.lyricLines;
        }

        const hour = new Date(h.timestamp).getHours();
        hourCounts[hour]++;
      });

      const topSongs = Object.values(countMap).sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.totalDuration - a.totalDuration;
      });
      
      const topArtists = Object.keys(artistMap)
        .map(name => ({ 
            name, 
            count: artistMap[name].count,
            src: artistMap[name].src
        }))
        .sort((a, b) => b.count - a.count);
      
      const mostPlayedArtist = topArtists[0] || null;
      const mostPlayedSong = topSongs[0] || null;

      const totalPlays = filtered.length;
      const maxHourVal = Math.max(...hourCounts);
      const peakHour = hourCounts.indexOf(maxHourVal);
      const totalHours = totalSeconds / 3600;
      const today = new Date(Date.now());
      const dayOfWeek = today.getDay(); 

      let vibeLabel = "分析中...";
      let topArtistShare = "0%";

      if (totalPlays > 0) {
        const topArtistRatio = mostPlayedArtist ? (mostPlayedArtist.count / totalPlays) : 0;
        const topSongRatio = mostPlayedSong ? (mostPlayedSong.count / totalPlays) : 0;
        const diversityRatio = uniqueArtists.size / totalPlays;
        
        topArtistShare = Math.round(topArtistRatio * 100) + "%";

        if (totalPlays < 5) {
            vibeLabel = "音楽探しの途中";
        }
        // 優先度 1: 集中度
        else if (topArtistRatio >= 0.6) {
            vibeLabel = `${mostPlayedArtist.name} 一筋`;
        }
        else if (topSongRatio >= 0.5) {
            vibeLabel = "一点集中リピート";
        }
        else if (diversityRatio >= 0.8) {
            vibeLabel = "幅広く開拓中";
        }
        // 優先度 2: 連続性・長時間再生
        else if (totalHours >= 4) {
            vibeLabel = "耐久リスニングマスター";
        }
        // 優先度 3: 曜日別スタイル
        else if (dayOfWeek === 5) { // 金曜日
            vibeLabel = "💃 解放のフライデー";
        } 
        else if (dayOfWeek === 6) { // 土曜日
            vibeLabel = "🥳 週末お祭りモード";
        } 
        else if (dayOfWeek === 0) { // 日曜日
            vibeLabel = "🧘‍♂️ 明日への充電";
        }
        // 最終フォールバック: 時間帯判定
        else {
            if (peakHour >= 4 && peakHour < 9) { vibeLabel = "早起きスタイル"; }
            else if (peakHour >= 9 && peakHour < 12) { vibeLabel = "午前中の集中"; }
            else if (peakHour >= 12 && peakHour < 17) { vibeLabel = "午後ワーク"; }
            else if (peakHour >= 17 && peakHour < 23) { vibeLabel = "夜型リスナー"; }
            else { vibeLabel = "深夜の没頭"; }
        }
      } else {
        vibeLabel = "No Data";
      }

      return {
        totalPlays,
        totalTime: this.formatDuration(totalSeconds),
        totalLyrics: totalLyrics.toLocaleString(),
        vibeLabel,
        topArtistShare,
        peakHour,
        topSongs: topSongs.slice(0, 50),
        topArtists: topArtists.slice(0, 10),
        mostPlayedSong,
        mostPlayedArtist
      };
    },

    renderUI: async function () {
      if (!ui.replayPanel) return;
      const container = ui.replayPanel.querySelector('.ytm-replay-content');
      
      const range = ui.replayPanel.dataset.range || 'day';
      const stats = await this.getStats(range);
      
      const pills = ui.replayPanel.querySelectorAll('.ytm-lang-pill');
      if (pills[0]) pills[0].textContent = t('replay_today');
      if (pills[1]) pills[1].textContent = t('replay_week');
      if (pills[2]) pills[2].textContent = t('replay_all');


      let footerArea = document.getElementById('replay-footer-area');
      
      const oldBtn1 = document.getElementById('replay-reset-action');
      const oldBtn2 = document.getElementById('replay-export-btn');
      const oldBtn3 = document.getElementById('replay-import-btn');
      if (oldBtn1 && !oldBtn1.closest('.replay-footer-area')) oldBtn1.remove();
      if (oldBtn2) oldBtn2.remove();
      if (oldBtn3) oldBtn3.remove();

      if (!footerArea) {
          footerArea = createEl('div', 'replay-footer-area', 'replay-footer-area');
          ui.replayPanel.appendChild(footerArea);
      }

      footerArea.innerHTML = `
        <button id="replay-import-btn" class="replay-footer-btn">📂 Restore</button>
        <button id="replay-export-btn" class="replay-footer-btn">💾 Backup</button>
        <button id="replay-reset-action" class="replay-footer-btn" style="color:#ff6b6b; border-color:rgba(255,107,107,0.3);">🗑️ Reset</button>
      `;

      document.getElementById('replay-reset-action').onclick = async () => {
        if (confirm(t('replay_reset_confirm'))) {
            await storage.remove(ReplayManager.HISTORY_KEY);
            ReplayManager.renderUI();
        }
      };
      document.getElementById('replay-export-btn').onclick = () => this.exportHistory();
      document.getElementById('replay-import-btn').onclick = () => this.importHistory();

      if (stats.totalPlays === 0) {
         container.innerHTML = `<div class="replay-empty"><div style="font-size:40px; margin-bottom:10px;">🎧</div><div>${t('replay_empty')}</div><div style="font-size:12px; opacity:0.6; margin-top:5px;">${t('replay_no_data_sub')}</div></div>`;
        return;
      }

      const heroImage = stats.mostPlayedSong?.src || '';
      
      const artistBgStyle = `background: linear-gradient(135deg, rgba(50,100,255,0.1), rgba(255,255,255,0.03));`;

      let topArtistsSubHtml = '';
      if (stats.topArtists.length > 1) {
          topArtistsSubHtml = `<div style="margin-top:auto; padding-top:10px; border-top:1px solid rgba(255,255,255,0.1); font-size:12px; font-weight:600; color:rgba(255,255,255,0.9);">`;
          if (stats.topArtists[1]) topArtistsSubHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:4px; align-items:center;"><span style="opacity:0.9;">#2 ${stats.topArtists[1].name}</span><span style="opacity:0.7;">${stats.topArtists[1].count}回</span></div>`;
          if (stats.topArtists[2]) topArtistsSubHtml += `<div style="display:flex; justify-content:space-between; align-items:center;"><span style="opacity:0.9;">#3 ${stats.topArtists[2].name}</span><span style="opacity:0.7;">${stats.topArtists[2].count}回</span></div>`;
          topArtistsSubHtml += `</div>`;
      }

      let html = `
        <div class="bento-grid">
          
          <div class="bento-item hero-stat-time">
            <div class="bento-label">${t('replay_playTime')}</div>
            <div class="bento-value-huge">${stats.totalTime}</div>
            <div class="bento-sub">${stats.totalPlays} ${t('replay_plays')}</div>
          </div>

          <div class="bento-item hero-song" style="background-image: url('${heroImage}');">
            <div class="bento-overlay">
              <div class="bento-label">${t('replay_topSong')}</div>
              <div class="bento-song-title">${stats.mostPlayedSong?.title}</div>
              <div class="bento-song-artist">${stats.mostPlayedSong?.artist}</div>
              <div class="bento-badge">${stats.mostPlayedSong?.count} ${t('replay_plays')}</div>
            </div>
          </div>

          <div class="bento-item hero-vibe">
            <div class="bento-label">${t('replay_vibe')}</div>
            <div class="bento-vibe-text" style="font-size:24px; font-weight:900; margin-top:10px; line-height:1.2; word-break:break-all;">${stats.vibeLabel}</div>
          </div>

          <div class="bento-item hero-lyrics">
            <div class="bento-label">${t('replay_lyrics_heard')}</div>
            <div class="bento-value-huge" style="font-size: 42px;">${stats.totalLyrics}</div>
            <div class="bento-sub">行</div>
          </div>

          <div class="bento-item hero-artist" style="${artistBgStyle} position:relative; overflow:hidden;">
            <div style="position:relative; z-index:2; height:100%; display:flex; flex-direction:column; color:#fff; padding-bottom:5px;">
                <div class="bento-label" style="color:rgba(255,255,255,0.7);">${t('replay_topArtist')}</div>
                
                <div class="bento-artist-name" style="font-size:28px; font-weight:900; margin: 5px 0 10px 0; color:#fff; line-height:1.1; flex-shrink: 0; min-height: 30px;">
                    ${stats.mostPlayedArtist?.name || 'N/A'}
                </div>
                
                <div class="bento-badge" style="font-size:11px; padding:4px 10px; margin-bottom:10px; align-self:flex-start; background:rgba(255,255,255,0.25); border:1px solid rgba(255,255,255,0.1);">
                    総再生の ${stats.topArtistShare}
                </div>

                ${topArtistsSubHtml}
            </div>
          </div>

          <div class="bento-item ranking-list-container">
            <div class="bento-label">${t('replay_ranking')}</div>
            <div class="replay-list">`;
            
      stats.topSongs.forEach((song, idx) => {
        const timeStr = this.formatDuration(song.totalDuration);
        html += `
          <div class="replay-item">
            <div class="replay-rank">${idx + 1}</div>
            <div class="replay-img">${song.src ? `<img src="${song.src}" crossorigin="anonymous">` : ''}</div>
            <div class="replay-info">
              <div class="replay-title">${song.title}</div>
              <div class="replay-artist">${song.artist}</div>
            </div>
            <div class="replay-count">
              <div class="replay-count-val">${song.count}${config.uiLang === 'ja' ? '回' : ''}</div>
              <div class="replay-time-val">${timeStr}</div>
            </div>
          </div>`;
      });
      html += `</div></div></div>`;
      container.innerHTML = html;
    },

    init: function () {
      setInterval(() => this.check(), 1000);
    }
  };

  const QueueManager = {
    observer: null,

    init: function () {
      if (ui.queuePanel) return;
      const trigger = createEl('div', 'ytm-queue-trigger');
      document.body.appendChild(trigger);
      const panel = createEl('div', 'ytm-queue-panel', '', `
        <h3>Up Next</h3>
        <div class="queue-list-content">
            <div class="lyric-loading">Loading...</div>
        </div>
      `);
      document.body.appendChild(panel);
      ui.queuePanel = panel;

      let leaveTimer = null;
      const openPanel = () => {
        clearTimeout(leaveTimer);
        panel.classList.add('visible');
        this.syncQueue();
      };
      const closePanel = () => {
        leaveTimer = setTimeout(() => {
          panel.classList.remove('visible');
        }, 300);
      };

      trigger.addEventListener('mouseenter', openPanel);
      panel.addEventListener('mouseenter', () => clearTimeout(leaveTimer));
      panel.addEventListener('mouseleave', closePanel);
      trigger.addEventListener('mouseleave', () => {
        setTimeout(() => {
          if (!panel.matches(':hover')) closePanel();
        }, 100);
      });

      this.startObserver();
    },

    onSongChanged: function() {
        debouncedSyncQueue();
    },

    startObserver: function() {
        const originalQueue = document.querySelector('ytmusic-player-queue');
        if (originalQueue && !this.observer) {
            this.observer = new MutationObserver(() => {
                debouncedSyncQueue();
            });
            this.observer.observe(originalQueue, { 
                childList: true, 
                subtree: true, 
                attributes: true 
            });
        }
    },

    syncQueue: function () {
      if (!ui.queuePanel) return;
      if (!this.observer) this.startObserver();

      const container = ui.queuePanel.querySelector('.queue-list-content');
      const allRawItems = document.querySelectorAll('ytmusic-player-queue-item');
      
      const visibleItems = Array.from(allRawItems).filter(item => {
        return item.offsetParent !== null && item.getBoundingClientRect().height > 0;
      });

      if (visibleItems.length === 0) return;

      let currentIndex = visibleItems.findIndex(item => item.hasAttribute('selected'));
      if (currentIndex === -1) currentIndex = 0;

      const targetItems = visibleItems.slice(currentIndex);

      container.innerHTML = '';
      const seenKeys = new Set();

      targetItems.forEach((item, idx) => {
        const titleEl = item.querySelector('.song-title');
        const artistEl = item.querySelector('.byline');
        const imgEl = item.querySelector('.thumbnail img');
        
        const isPlaying = (idx === 0);

        if (!titleEl) return;

        const title = titleEl.textContent.trim();
        const artist = artistEl ? artistEl.textContent.trim() : '';
        
        const uniqueKey = `${title}///${artist}`;
        if (seenKeys.has(uniqueKey)) return;
        seenKeys.add(uniqueKey);

        let src = '';
        if (imgEl && imgEl.src && !imgEl.src.startsWith('data:')) {
            src = imgEl.src;
        }

        const row = createEl('div', '', `queue-item ${isPlaying ? 'current' : ''}`);
        
        const imgHtml = src 
            ? `<img src="${src}" loading="lazy">` 
            : `<div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;background:#333;font-size:18px;">💿</div>`;

        const indicatorHtml = isPlaying 
            ? `<div class="queue-playing-indicator"><i></i><i></i><i></i></div>` 
            : '';

        row.innerHTML = `
            <div class="queue-img">
                ${imgHtml}
                ${indicatorHtml}
            </div>
            <div class="queue-info">
                <div class="queue-title">${title}</div>
                <div class="queue-artist">${artist}</div>
            </div>
        `;

        row.onclick = (e) => {
          e.stopPropagation();
          const playButton = item.querySelector('.play-button') || item.querySelector('ytmusic-play-button-renderer');
          if (playButton) {
              playButton.click();
          } else {
              item.click();
          }
          setTimeout(() => this.syncQueue(), 500);
        };

        container.appendChild(row);
      });
    }
  };

  /* ========================================================= */

  const resolveDeepLTargetLang = (lang) => {
    switch ((lang || '').toLowerCase()) {
      case 'en': case 'en-us': case 'en-gb': return 'EN';
      case 'ja': return 'JA';
      case 'ko': return 'KO';
      case 'fr': return 'FR';
      case 'de': return 'DE';
      case 'es': return 'ES';
      case 'zh': case 'zh-cn': case 'zh-tw': return 'ZH';
      default: return 'JA';
    }
  };

  const parseLRCInternal = (lrc) => {
    if (!lrc) return { lines: [], hasTs: false };
    const tagTest = /\[\d{2}:\d{2}\.\d{2,3}\]/;
    if (!tagTest.test(lrc)) {
      const lines = lrc.split(/\r?\n/).map(line => {
        const text = line.replace(/^\s+|\s+$/g, '');
        return { time: null, text };
      });
      return { lines, hasTs: false };
    }
    const tagExp = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
    const result = [];
    let match;
    let lastTime = null;
    let lastIndex = 0;
    while ((match = tagExp.exec(lrc)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const fracStr = match[3];
      const frac = parseInt(fracStr, 10) / (fracStr.length === 2 ? 100 : 1000);
      const time = min * 60 + sec + frac;
      if (lastTime !== null) {
        const rawText = lrc.slice(lastIndex, match.index);
        const cleaned = rawText.replace(/\r?\n/g, ' ');
        const text = cleaned.trim();
        result.push({ time: lastTime, text });
      }
      lastTime = time;
      lastIndex = tagExp.lastIndex;
    }
    if (lastTime !== null && lastIndex < lrc.length) {
      const rawText = lrc.slice(lastIndex);
      const cleaned = rawText.replace(/\r?\n/g, ' ');
      const text = cleaned.trim();
      result.push({ time: lastTime, text });
    }
    result.sort((a, b) => (a.time || 0) - (b.time || 0));
    return { lines: result, hasTs: true };
  };

  const parseBaseLRC = (lrc) => {
    const { lines, hasTs } = parseLRCInternal(lrc);
    hasTimestamp = hasTs;
    return lines;
  };

  const parseLRCNoFlag = (lrc) => {
    return parseLRCInternal(lrc).lines;
  };

  const normalizeStr = (s) => (s || '').replace(/\s+/g, '').trim();

  const isMixedLang = (s) => {
    if (!s) return false;
    const hasLatin = /[A-Za-z]/.test(s);
    const hasCJK = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/.test(s);
    const hasHangul = /[\uAC00-\uD7AF]/.test(s);
    let kinds = 0;
    if (hasLatin) kinds++;
    if (hasCJK) kinds++;
    if (hasHangul) kinds++;
    return kinds >= 2;
  };

  const detectCharScript = (ch) => {
    if (!ch) return 'OTHER';
    if (/[A-Za-z]/.test(ch)) return 'LATIN';
    if (/[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/.test(ch)) return 'CJK';
    if (/[\uAC00-\uD7AF]/.test(ch)) return 'HANGUL';
    return 'OTHER';
  };

  const segmentByScript = (s) => {
    const result = [];
    if (!s) return result;
    let currentScript = null;
    let buf = '';
    for (const ch of s) {
      const script = detectCharScript(ch);
      if (currentScript === null) {
        currentScript = script;
        buf = ch;
      } else if (script === currentScript) {
        buf += ch;
      } else {
        result.push({ script: currentScript, text: buf });
        currentScript = script;
        buf = ch;
      }
    }
    if (buf) {
      result.push({ script: currentScript, text: buf });
    }
    return result;
  };

  const shouldTranslateSegment = (script, langCode) => {
    const lang = (langCode || '').toLowerCase();
    if (script === 'OTHER') return false;
    switch (lang) {
      case 'ja': return script === 'LATIN' || script === 'HANGUL';
      case 'en': return script === 'CJK' || script === 'HANGUL';
      case 'ko': return script === 'LATIN' || script === 'CJK';
      default: return script !== 'LATIN';
    }
  };

  const translateMixedSegments = async (lines, indexes, langCode, targetLang) => {
    try {
      const segmentsToTranslate = [];
      const perLineSegments = {};
      indexes.forEach(idx => {
        const line = lines[idx];
        const text = (line && line.text) || '';
        const segs = segmentByScript(text);
        const segMeta = [];
        segs.forEach(seg => {
          if (shouldTranslateSegment(seg.script, langCode)) {
            const translateIndex = segmentsToTranslate.length;
            segmentsToTranslate.push(seg.text);
            segMeta.push({ original: seg.text, translateIndex });
          } else {
            segMeta.push({ original: seg.text, translateIndex: null });
          }
        });
        perLineSegments[idx] = segMeta;
      });
      if (!segmentsToTranslate.length) return null;
      const res = await new Promise(resolve => {
        chrome.runtime.sendMessage(
          { type: 'TRANSLATE', payload: { text: segmentsToTranslate, apiKey: config.deepLKey, targetLang } },
          resolve
        );
      });
      if (!res?.success || !Array.isArray(res.translations) || res.translations.length !== segmentsToTranslate.length) {
        return null;
      }
      const segTranslations = res.translations.map(t => t.text || '');
      const result = {};
      Object.keys(perLineSegments).forEach(key => {
        const lineIdx = Number(key);
        const segMeta = perLineSegments[lineIdx];
        let rebuilt = '';
        segMeta.forEach(seg => {
          if (seg.translateIndex == null) {
            rebuilt += seg.original;
          } else {
            rebuilt += segTranslations[seg.translateIndex] ?? seg.original;
          }
        });
        result[lineIdx] = rebuilt;
      });
      return result;
    } catch (e) {
      console.error('DeepL mixed-line fallback failed', e);
      return null;
    }
  };

  const dedupePrimarySecondary = (lines) => {
    if (!Array.isArray(lines)) return lines;
    lines.forEach(l => {
      if (!l.translation) return;
      const src = normalizeStr(l.text);
      const trn = normalizeStr(l.translation);
      if (src === trn && !isMixedLang(l.text)) {
        delete l.translation;
      }
    });
    return lines;
  };

  const translateTo = async (lines, langCode) => {
    if (!config.deepLKey || !lines.length) return null;
    const targetLang = resolveDeepLTargetLang(langCode);
    try {
      const baseTexts = lines.map(l => l.text || '');
      const res = await new Promise(resolve => {
        chrome.runtime.sendMessage(
          { type: 'TRANSLATE', payload: { text: baseTexts, apiKey: config.deepLKey, targetLang } },
          resolve
        );
      });
      if (!res?.success || !Array.isArray(res.translations) || res.translations.length !== lines.length) {
        return null;
      }
      let translated = res.translations.map(t => t.text || '');
      const fallbackIndexes = [];
      for (let i = 0; i < lines.length; i++) {
        const src = baseTexts[i];
        const trn = translated[i];
        if (!src) continue;
        if (normalizeStr(src) === normalizeStr(trn) && isMixedLang(src)) {
          fallbackIndexes.push(i);
        }
      }
      if (fallbackIndexes.length) {
        const mixedFallback = await translateMixedSegments(lines, fallbackIndexes, langCode, targetLang);
        if (mixedFallback) {
          fallbackIndexes.forEach(i => {
            if (mixedFallback[i]) translated[i] = mixedFallback[i];
          });
        }
      }
      return translated;
    } catch (e) {
      console.error('DeepL failed', e);
    }
    return null;
  };

  const getMetadata = () => {
    if (navigator.mediaSession?.metadata) {
      const { title, artist, artwork } = navigator.mediaSession.metadata;
      return {
        title,
        artist,
        src: artwork.length ? artwork[artwork.length - 1].src : null
      };
    }
    const t = document.querySelector('yt-formatted-string.title.style-scope.ytmusic-player-bar');
    const a = document.querySelector('.byline.style-scope.ytmusic-player-bar');
    return (t && a)
      ? { title: t.textContent, artist: a.textContent.split('•')[0].trim(), src: null }
      : null;
  };

  const getCurrentVideoUrl = () => {
    try {
      const url = new URL(location.href);
      const vid = url.searchParams.get('v');
      return vid ? `https://youtu.be/${vid}` : location.href;
    } catch (e) {
      console.warn('Failed to get current video url', e);
      return '';
    }
  };

  const getCurrentVideoId = () => {
    try {
      const url = new URL(location.href);
      return url.searchParams.get('v');
    } catch (e) {
      return null;
    }
  };

  const createEl = (tag, id, cls, html) => {
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (cls) el.className = cls;
    if (html !== undefined && html !== null) el.innerHTML = html;
    return el;
  };

  const showToast = (text) => {
    if (!text) return;
    let el = document.getElementById('ytm-toast');
    if (!el) {
      el = createEl('div', 'ytm-toast', '', '');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('visible');
    }, 5000);
  };

  function setupAutoHideEvents() {
    if (document.body.dataset.autohideSetup) return;
    ['mousemove', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, handleInteraction));
    document.body.dataset.autohideSetup = 'true';
    handleInteraction();
  }

  async function applyTranslations(baseLines, youtubeUrl) {
    if (!config.useTrans || !Array.isArray(baseLines) || !baseLines.length) return baseLines;
    const mainLangStored = await storage.get('ytm_main_lang');
    const subLangStored = await storage.get('ytm_sub_lang');
    if (mainLangStored) config.mainLang = mainLangStored;
    if (subLangStored !== null && subLangStored !== undefined) config.subLang = subLangStored;
    const mainLang = config.mainLang || 'original';
    const subLang = config.subLang || '';
    const langsToFetch = [];
    if (mainLang && mainLang !== 'original') langsToFetch.push(mainLang);
    if (subLang && subLang !== 'original' && subLang !== mainLang && subLang) langsToFetch.push(subLang);
    if (!langsToFetch.length) return baseLines;

    let lrcMap = {};
    try {
      const res = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          type: 'GET_TRANSLATION',
          payload: { youtube_url: youtubeUrl, langs: langsToFetch }
        }, resolve);
      });
      if (res?.success && res.lrcMap) lrcMap = res.lrcMap;
    } catch (e) {
      console.warn('GET_TRANSLATION failed', e);
    }

    const transLinesByLang = {};
    const needDeepL = [];

    langsToFetch.forEach(lang => {
      const lrc = (lrcMap && lrcMap[lang]) || '';
      if (lrc) {
        const parsed = parseLRCNoFlag(lrc);
        transLinesByLang[lang] = parsed;
      } else {
        needDeepL.push(lang);
      }
    });

    if (needDeepL.length && config.deepLKey) {
      for (const lang of needDeepL) {
        const translatedTexts = await translateTo(baseLines, lang);
        if (translatedTexts && translatedTexts.length === baseLines.length) {
          const lines = baseLines.map((l, i) => ({
            time: l.time,
            text: translatedTexts[i]
          }));
          transLinesByLang[lang] = lines;
          const plain = translatedTexts.join('\n');
          if (plain.trim() && !isFallbackLyrics) {
            chrome.runtime.sendMessage({
              type: 'REGISTER_TRANSLATION',
              payload: { youtube_url: youtubeUrl, lang, lyrics: plain }
            }, (res) => {
              console.log('[CS] REGISTER_TRANSLATION', lang, res);
            });
          }
        }
      }
    }

    const alignedMap = buildAlignedTranslations(baseLines, transLinesByLang);
    const final = baseLines.map(l => ({ ...l }));
    const getLangTextAt = (langCode, index, baseText) => {
      if (!langCode || langCode === 'original') return baseText;
      const arr = alignedMap[langCode];
      if (!arr) return baseText;
      const v = arr[index];
      return (v === null || v === undefined) ? baseText : v;
    };

    for (let i = 0; i < final.length; i++) {
      const baseText = final[i].text;
      let primary = getLangTextAt(mainLang, i, baseText);
      let secondary = null;
      if (subLang && subLang !== mainLang) {
        secondary = getLangTextAt(subLang, i, baseText);
      } else if (!subLang && mainLang !== 'original') {
        if (normalizeStr(primary) !== normalizeStr(baseText)) {
          secondary = baseText;
        }
      }
      if (secondary && normalizeStr(primary) === normalizeStr(secondary)) {
        if (!isMixedLang(baseText)) secondary = null;
      }
      final[i].text = primary;
      if (secondary) final[i].translation = secondary;
      else delete final[i].translation;
    }
    dedupePrimarySecondary(final);
    return final;
  }

  const buildAlignedTranslations = (baseLines, transLinesByLang) => {
    const alignedMap = {};
    const TOL = 0.15;
    Object.keys(transLinesByLang).forEach(lang => {
      const arr = transLinesByLang[lang];
      const res = new Array(baseLines.length).fill(null);
      if (!Array.isArray(arr) || !arr.length) {
        alignedMap[lang] = res;
        return;
      }
      let j = 0;
      for (let i = 0; i < baseLines.length; i++) {
        const baseLine = baseLines[i] || {};
        const tBase = baseLine.time;
        const baseTextRaw = (baseLine.text ?? '');
        const isEmptyBaseLine = typeof baseTextRaw === 'string' && baseTextRaw.trim() === '';
        if (isEmptyBaseLine) {
          res[i] = '';
          continue;
        }
        if (typeof tBase !== 'number') {
          const cand = arr[i];
          if (cand && typeof cand.text === 'string') {
            const raw = cand.text;
            const trimmed = raw.trim();
            res[i] = trimmed === '' ? '' : trimmed;
          }
          continue;
        }
        while (j < arr.length && typeof arr[j].time === 'number' && arr[j].time < tBase - TOL) {
          j++;
        }
        if (j < arr.length && typeof arr[j].time === 'number' && Math.abs(arr[j].time - tBase) <= TOL) {
          const raw = (arr[j].text ?? '');
          const trimmed = raw.trim();
          res[i] = trimmed === '' ? '' : trimmed;
          j++;
        }
      }
      alignedMap[lang] = res;
    });
    return alignedMap;
  };

  async function applyLyricsText(rawLyrics) {
    const keyAtStart = currentKey;
    if (!rawLyrics || typeof rawLyrics !== 'string' || !rawLyrics.trim()) {
      if (keyAtStart !== currentKey) return;
      lyricsData = [];
      hasTimestamp = false;
      renderLyrics([]);
      return;
    }
    let parsed = parseBaseLRC(rawLyrics);
    const videoUrl = getCurrentVideoUrl();
    let finalLines = parsed;
    if (config.useTrans) {
      finalLines = await applyTranslations(parsed, videoUrl);
    }
    if (keyAtStart !== currentKey) return;
    lyricsData = finalLines;
    renderLyrics(finalLines);
  }

  async function selectCandidateById(candId) {
    if (!Array.isArray(lyricsCandidates) || !lyricsCandidates.length) return;
    const cand = lyricsCandidates.find((c, idx) => (c.id || String(idx)) === candId);
    if (!cand || typeof cand.lyrics !== 'string' || !cand.lyrics.trim()) return;
    selectedCandidateId = candId;
    dynamicLines = null;
    if (currentKey) {
      storage.set(currentKey, {
        lyrics: cand.lyrics,
        dynamicLines: null,
        noLyrics: false,
        candidateId: cand.id || null
      });
    }
    await applyLyricsText(cand.lyrics);
    const youtube_url = getCurrentVideoUrl();
    const video_id = getCurrentVideoId();
    const candidate_id = cand.id || candId;
    try {
      chrome.runtime.sendMessage(
        { type: 'SELECT_LYRICS_CANDIDATE', payload: { youtube_url, video_id, candidate_id } },
        (res) => console.log('[CS] SELECT_LYRICS_CANDIDATE result:', res)
      );
    } catch (e) {
      console.warn('[CS] SELECT_LYRICS_CANDIDATE failed to send', e);
    }
    const reloadKey = currentKey;
    setTimeout(() => {
      const metaNow = getMetadata();
      if (!metaNow) return;
      const keyNow = `${metaNow.title}///${metaNow.artist}`;
      if (keyNow !== reloadKey) return;
      storage.remove(reloadKey);
      loadLyrics(metaNow);
    }, 10000);
  }

  function refreshCandidateMenu() {
    if (!ui.uploadMenu) {
      if (ui.lyricsBtn) ui.lyricsBtn.classList.remove('ytm-lyrics-has-candidates');
      return;
    }
    const section = ui.uploadMenu.querySelector('.ytm-upload-menu-candidates');
    const list = section ? section.querySelector('.ytm-upload-menu-candidate-list') : null;
    if (!section || !list) return;
    list.innerHTML = '';
    if (!Array.isArray(lyricsCandidates) || lyricsCandidates.length <= 1) {
      section.style.display = 'none';
      if (ui.lyricsBtn) ui.lyricsBtn.classList.remove('ytm-lyrics-has-candidates');
      return;
    }
    section.style.display = 'block';
    lyricsCandidates.forEach((cand, idx) => {
      const id = cand.id || String(idx);
      const btn = document.createElement('button');
      btn.className = 'ytm-upload-menu-item ytm-upload-menu-item-candidate';
      btn.dataset.action = 'candidate';
      btn.dataset.candidateId = id;
      let labelText = '';
      if (cand.artist && cand.title) labelText = `${cand.artist} - ${cand.title}`;
      else if (cand.artist || cand.title) labelText = `${cand.artist || ''}${cand.artist && cand.title ? ' - ' : ''}${cand.title || ''}`;
      else if (cand.path) labelText = cand.path;
      else labelText = `候補${idx + 1}`;
      if (cand.source) labelText += ` [${cand.source}]`;
      if (cand.has_synced) labelText += ' ⏱';
      btn.textContent = labelText;
      list.appendChild(btn);
    });
    if (ui.lyricsBtn) {
      ui.lyricsBtn.classList.remove('ytm-lyrics-has-candidates');
      void ui.lyricsBtn.offsetWidth;
      ui.lyricsBtn.classList.add('ytm-lyrics-has-candidates');
    }
  }

  function refreshLockMenu() {
    if (!ui.uploadMenu) return;
    const lockSection = ui.uploadMenu.querySelector('.ytm-upload-menu-locks');
    const lockList = lockSection ? lockSection.querySelector('.ytm-upload-menu-lock-list') : null;
    const addSyncBtn = ui.uploadMenu.querySelector('.ytm-upload-menu-item[data-action="add-sync"]');
    if (!lockSection || !lockList || !addSyncBtn) return;
    lockList.innerHTML = '';
    const mergedRequests = [];
    if (Array.isArray(lyricsRequests)) {
      lyricsRequests.forEach(r => { if (r) mergedRequests.push({ ...r }); });
    }
    const ensureRequest = (id, label, target) => {
      const idLower = String(id).toLowerCase();
      if (mergedRequests.some(r => String(r.request || r.id || '').toLowerCase() === idLower)) return;
      mergedRequests.push({ request: id, label, target });
    };
    ensureRequest('lock_current_sync', '同期歌詞を確定 (Lock sync)', 'sync');
    ensureRequest('lock_current_dynamic', '動く歌詞を確定 (Lock dynamic)', 'dynamic');
    const activeReqs = mergedRequests.filter(r => {
      if (!r) return false;
      if (r.has_lyrics) return true;
      if (r.target === 'sync' || r.target === 'dynamic') return true;
      const key = String(r.request || r.id || '').toLowerCase();
      if (!key) return false;
      return key.startsWith('lock_current_');
    });
    if (!activeReqs.length) {
      lockSection.style.display = 'none';
    } else {
      lockSection.style.display = 'block';
      const syncLocked = !!(lyricsConfig && lyricsConfig.SyncLocked);
      const dynamicLocked = !!(lyricsConfig && lyricsConfig.dynmicLock);
      activeReqs.forEach(r => {
        const btn = document.createElement('button');
        btn.className = 'ytm-upload-menu-item';
        btn.dataset.action = 'lock-request';
        btn.dataset.requestId = r.request || r.id || '';
        btn.textContent = r.label || r.request || r.id || '歌詞を確定';
        const key = String(r.request || r.id || '').toLowerCase();
        const isSync = r.target === 'sync' || key.includes('sync');
        const isDynamic = r.target === 'dynamic' || key.includes('dynamic');
        const locked = r.locked || (isSync && syncLocked) || (isDynamic && dynamicLocked);
        if (locked) {
          btn.classList.add('ytm-upload-menu-item-disabled');
          btn.title = 'すでに確定された歌詞です';
        }
        lockList.appendChild(btn);
      });
    }
    const syncLocked = !!(lyricsConfig && lyricsConfig.SyncLocked);
    const dynamicLocked = !!(lyricsConfig && lyricsConfig.dynmicLock);
    const shouldDisableAddSync = syncLocked && dynamicLocked;
    addSyncBtn.classList.toggle('ytm-upload-menu-item-disabled', shouldDisableAddSync);
    if (shouldDisableAddSync) {
      addSyncBtn.dataset.disabledMessage = 'すでに確定された歌詞です';
      addSyncBtn.title = 'すでに確定された歌詞です';
    } else {
      delete addSyncBtn.dataset.disabledMessage;
      addSyncBtn.title = '';
    }
  }

  function setupUploadMenu(uploadBtn) {
    if (!ui.btnArea || ui.uploadMenu) return;
    ui.btnArea.style.position = 'relative';
    const menu = createEl('div', 'ytm-upload-menu', 'ytm-upload-menu');
    menu.innerHTML = `
            <div class="ytm-upload-menu-title">Lyrics</div>
            <button class="ytm-upload-menu-item" data-action="local">
                <span class="ytm-upload-menu-item-icon">💾</span>
                <span>ローカル歌詞読み込み / ReadLyrics</span>
            </button>
            <button class="ytm-upload-menu-item" data-action="add-sync">
                <span class="ytm-upload-menu-item-icon">✨</span>
                <span>歌詞同期を追加 / AddTiming</span>
            </button>
            <div class="ytm-upload-menu-locks" style="display:none;">
                <div class="ytm-upload-menu-subtitle">歌詞を確定 / Confirm</div>
                <div class="ytm-upload-menu-lock-list"></div>
            </div>
            <div class="ytm-upload-menu-separator"></div>
            <button class="ytm-upload-menu-item" data-action="fix">
                <span class="ytm-upload-menu-item-icon">✏️</span>
                <span>歌詞の間違いを修正 / FixLyrics</span>
            </button>
            <div class="ytm-upload-menu-candidates" style="display:none;">
                <div class="ytm-upload-menu-subtitle">別の歌詞を選択</div>
                <div class="ytm-upload-menu-candidate-list"></div>
            </div>
        `;
    ui.btnArea.appendChild(menu);
    ui.uploadMenu = menu;
    const toggleMenu = (show) => {
      if (!ui.uploadMenu) return;
      const cl = ui.uploadMenu.classList;
      if (show === undefined) cl.toggle('visible');
      else if (show) cl.add('visible');
      else cl.remove('visible');
    };
    uploadBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleMenu();
    });
    ui.uploadMenu.addEventListener('click', (ev) => {
      const target = ev.target.closest('.ytm-upload-menu-item');
      if (!target) return;
      if (target.classList.contains('ytm-upload-menu-item-disabled')) {
        const msg = target.dataset.disabledMessage || 'この操作は現在利用できません';
        showToast(msg);
        return;
      }
      const action = target.dataset.action;
      const candId = target.dataset.candidateId || null;
      const reqId = target.dataset.requestId || null;
      toggleMenu(false);
      if (action === 'local') {
        ui.input?.click();
      } else if (action === 'add-sync') {
        const videoUrl = getCurrentVideoUrl();
        const base = 'https://lrchub.coreone.work';
        const lrchubUrl = videoUrl ? `${base}/manual?video_url=${encodeURIComponent(videoUrl)}` : base;
        window.open(lrchubUrl, '_blank');
      } else if (action === 'fix') {
        const vid = getCurrentVideoId();
        if (!vid) {
          alert('動画IDが取得できませんでした。YouTube Music の再生画面で実行してください。');
          return;
        }
        const githubUrl = `https://github.com/LRCHub/${vid}/edit/main/README.md`;
        window.open(githubUrl, '_blank');
      } else if (action === 'candidate' && candId) {
        selectCandidateById(candId);
      } else if (action === 'lock-request' && reqId) {
        sendLockRequest(reqId);
      }
    });
    if (!uploadMenuGlobalSetup) {
      uploadMenuGlobalSetup = true;
      document.addEventListener('click', (ev) => {
        if (!ui.uploadMenu) return;
        if (!ui.uploadMenu.classList.contains('visible')) return;
        if (ui.uploadMenu.contains(ev.target) || uploadBtn.contains(ev.target)) return;
        ui.uploadMenu.classList.remove('visible');
      }, true);
    }
    refreshCandidateMenu();
    refreshLockMenu();
  }

  function setupDeleteDialog(trashBtn) {
    if (!ui.btnArea || ui.deleteDialog) return;
    ui.btnArea.style.position = 'relative';
    const dialog = createEl('div', 'ytm-delete-dialog', 'ytm-confirm-dialog', `
            <div class="ytm-confirm-title">歌詞を削除</div>
            <div class="ytm-confirm-message">
                この曲の保存済み歌詞を削除しますか？<br>
                <span style="font-size:11px;opacity:0.7;">ローカルキャッシュのみ削除されます。</span>
            </div>
            <div class="ytm-confirm-buttons">
                <button class="ytm-confirm-btn cancel">キャンセル</button>
                <button class="ytm-confirm-btn danger">削除</button>
            </div>
        `);
    ui.btnArea.appendChild(dialog);
    ui.deleteDialog = dialog;
    const toggleDialog = (show) => {
      if (!ui.deleteDialog) return;
      const cl = ui.deleteDialog.classList;
      if (show === undefined) cl.toggle('visible');
      else if (show) cl.add('visible');
      else cl.remove('visible');
    };
    trashBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleDialog();
    });
    const cancelBtn = dialog.querySelector('.ytm-confirm-btn.cancel');
    const dangerBtn = dialog.querySelector('.ytm-confirm-btn.danger');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleDialog(false);
      });
    }
    if (dangerBtn) {
      dangerBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (currentKey) {
          storage.remove(currentKey);
          lyricsData = [];
          dynamicLines = null;
          lyricsCandidates = null;
          selectedCandidateId = null;
          lyricsRequests = null;
          lyricsConfig = null;
          renderLyrics([]);
          refreshCandidateMenu();
          refreshLockMenu();
        }
        toggleDialog(false);
      });
    }
    if (!deleteDialogGlobalSetup) {
      deleteDialogGlobalSetup = true;
      document.addEventListener('click', (ev) => {
        if (!ui.deleteDialog) return;
        if (!ui.deleteDialog.classList.contains('visible')) return;
        if (ui.deleteDialog.contains(ev.target) || trashBtn.contains(ev.target)) return;
        ui.deleteDialog.classList.remove('visible');
      }, true);
    }
  }

  function setupLangPills(groupId, currentValue, onChange) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const pills = Array.from(group.querySelectorAll('.ytm-lang-pill'));
    const apply = () => {
      pills.forEach(p => {
        p.classList.toggle('active', p.dataset.value === currentValue);
      });
    };
    apply();
    pills.forEach(p => {
      p.onclick = (e) => {
        e.stopPropagation();
        currentValue = p.dataset.value;
        apply();
        onChange(currentValue);
      };
    });
  }

  function initSettings() {
    if (ui.settings) return;
    ui.settings = createEl('div', 'ytm-settings-panel', '', `
            <button id="ytm-settings-close-btn" style="position:absolute;right:12px;top:10px;width:24px;height:24px;border-radius:999px;border:none;background:rgba(255,255,255,0.08);color:#fff;font-size:16px;line-height:1;cursor:pointer;">×</button>
            <h3>${t('settings_title')}</h3>
            
            <div class="setting-item ytm-lang-section">
                <div class="ytm-lang-label">${t('settings_ui_lang')}</div>
                <div class="ytm-lang-group" id="ui-lang-group">
                    <button class="ytm-lang-pill" data-value="ja">日本語</button>
                    <button class="ytm-lang-pill" data-value="en">English</button>
                </div>
            </div>

            <div class="setting-item" style="margin-top:10px;">
                <label class="toggle-label">
                    <span>${t('settings_trans')}</span>
                    <input type="checkbox" id="trans-toggle">
                </label>
            </div>
            <div class="setting-item ytm-lang-section">
                <div class="ytm-lang-label">${t('settings_main_lang')}</div>
                <div class="ytm-lang-group" id="main-lang-group">
                    <button class="ytm-lang-pill" data-value="original">Original</button>
                    <button class="ytm-lang-pill" data-value="ja">日本語</button>
                    <button class="ytm-lang-pill" data-value="en">English</button>
                    <button class="ytm-lang-pill" data-value="ko">한국어</button>
                </div>
            </div>
            <div class="setting-item ytm-lang-section">
                <div class="ytm-lang-label">${t('settings_sub_lang')}</div>
                <div class="ytm-lang-group" id="sub-lang-group">
                    <button class="ytm-lang-pill" data-value="">なし</button>
                    <button class="ytm-lang-pill" data-value="ja">日本語</button>
                    <button class="ytm-lang-pill" data-value="en">English</button>
                    <button class="ytm-lang-pill" data-value="ko">한국어</button>
                </div>
            </div>
            <div class="setting-item" style="margin-top:15px;">
                <input type="password" id="deepl-key-input" placeholder="DeepL API Key">
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button id="save-settings-btn" style="flex:1;">${t('settings_save')}</button>
                <button id="clear-all-btn" style="background:#ff3b30; color:white;">${t('settings_reset')}</button>
            </div>
        `);
    document.body.appendChild(ui.settings);
    (async () => {
      if (!config.deepLKey) config.deepLKey = await storage.get('ytm_deepl_key');
      const cachedTrans = await storage.get('ytm_trans_enabled');
      if (cachedTrans !== null && cachedTrans !== undefined) config.useTrans = cachedTrans;
      const mainLangStored = await storage.get('ytm_main_lang');
      const subLangStored = await storage.get('ytm_sub_lang');
      if (mainLangStored) config.mainLang = mainLangStored;
      if (subLangStored !== null && subLangStored !== undefined) config.subLang = subLangStored;
      const uiLangStored = await storage.get('ytm_ui_lang');
      if (uiLangStored) config.uiLang = uiLangStored;

      document.getElementById('deepl-key-input').value = config.deepLKey || '';
      document.getElementById('trans-toggle').checked = config.useTrans;
      
      setupLangPills('main-lang-group', config.mainLang, v => { config.mainLang = v; });
      setupLangPills('sub-lang-group', config.subLang, v => { config.subLang = v; });
      setupLangPills('ui-lang-group', config.uiLang || 'ja', v => { config.uiLang = v; });
    })();
    document.getElementById('save-settings-btn').onclick = () => {
      config.deepLKey = document.getElementById('deepl-key-input').value.trim();
      config.useTrans = document.getElementById('trans-toggle').checked;
      storage.set('ytm_deepl_key', config.deepLKey);
      storage.set('ytm_trans_enabled', config.useTrans);
      storage.set('ytm_main_lang', config.mainLang);
      storage.set('ytm_sub_lang', config.subLang);
      storage.set('ytm_ui_lang', config.uiLang);
      alert(t('settings_saved'));
      location.reload();
    };
    document.getElementById('clear-all-btn').onclick = storage.clear;
    const closeBtn = document.getElementById('ytm-settings-close-btn');
    if (closeBtn) {
      closeBtn.onclick = (ev) => {
        ev.stopPropagation();
        ui.settings.classList.remove('active');
      };
    }
    if (!settingsOutsideClickSetup) {
      settingsOutsideClickSetup = true;
      document.addEventListener('click', (ev) => {
        if (!ui.settings) return;
        if (!ui.settings.classList.contains('active')) return;
        if (ui.settings.contains(ev.target)) return;
        if (ui.settingsBtn && ui.settingsBtn.contains(ev.target)) return;
        ui.settings.classList.remove('active');
      }, true);
    }
  }

  function createReplayPanel() {
    ui.replayPanel = createEl('div', 'ytm-replay-panel', '', `
        <button class="replay-close-btn">×</button>
        <h3>Daily Replay</h3>
        
        <div class="ytm-lang-group" style="margin-bottom: 20px;">
            <button class="ytm-lang-pill active" data-range="day">${t('replay_today')}</button>
            <button class="ytm-lang-pill" data-range="week">${t('replay_week')}</button>
            <button class="ytm-lang-pill" data-range="all">${t('replay_all')}</button>
        </div>

        <div class="ytm-replay-content">
            <div class="lyric-loading">Calculating...</div>
        </div>

        <button id="replay-reset-action" class="replay-footer-btn">${t('settings_reset')} History</button>
    `);

    document.body.appendChild(ui.replayPanel);

    ui.replayPanel.querySelector('.replay-close-btn').onclick = () => {
      ui.replayPanel.classList.remove('active');
    };

    const pills = ui.replayPanel.querySelectorAll('.ytm-lang-pill');
    pills.forEach(p => {
      p.onclick = (e) => {
        pills.forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        ui.replayPanel.dataset.range = e.target.dataset.range;
        ReplayManager.renderUI();
      };
    });

    document.getElementById('replay-reset-action').onclick = async () => {
      if (confirm(t('replay_reset_confirm'))) {
        await storage.remove(ReplayManager.HISTORY_KEY);
        ReplayManager.renderUI();
      }
    };
  }

  function initLayout() {
    if (document.getElementById('ytm-custom-wrapper')) {
      ui.wrapper = document.getElementById('ytm-custom-wrapper');
      ui.bg = document.getElementById('ytm-custom-bg');
      ui.lyrics = document.getElementById('my-lyrics-container');
      ui.title = document.getElementById('ytm-custom-title');
      ui.artist = document.getElementById('ytm-custom-artist');
      ui.artwork = document.getElementById('ytm-artwork-container');
      ui.btnArea = document.getElementById('ytm-btn-area');
      setupAutoHideEvents();
      return;
    }
    ui.bg = createEl('div', 'ytm-custom-bg');
    document.body.appendChild(ui.bg);
    ui.wrapper = createEl('div', 'ytm-custom-wrapper');
    const leftCol = createEl('div', 'ytm-custom-left-col');
    ui.artwork = createEl('div', 'ytm-artwork-container');
    const info = createEl('div', 'ytm-custom-info-area');
    ui.title = createEl('div', 'ytm-custom-title');
    ui.artist = createEl('div', 'ytm-custom-artist');
    ui.btnArea = createEl('div', 'ytm-btn-area');

    const btns = [];
    const lyricsBtnConfig = { txt: 'Lyrics', cls: 'lyrics-btn', click: () => { } };
    const shareBtnConfig = { txt: 'Share', cls: 'share-btn', click: onShareButtonClick };
    
    const replayBtnConfig = {
      txt: '📊',
      cls: 'icon-btn',
      click: () => {
        if (!ui.replayPanel) {
          createReplayPanel();
        }
        ui.replayPanel.classList.add('active');
        ReplayManager.renderUI();
      }
    };

    const trashBtnConfig = { txt: '🗑️', cls: 'icon-btn', click: () => { } };
    const settingsBtnConfig = { txt: '⚙️', cls: 'icon-btn', click: () => { initSettings(); ui.settings.classList.toggle('active'); } };

    btns.push(lyricsBtnConfig, shareBtnConfig, replayBtnConfig, trashBtnConfig, settingsBtnConfig);

    btns.forEach(b => {
      const btn = createEl('button', '', `ytm-glass-btn ${b.cls || ''}`, b.txt);
      btn.onclick = b.click;
      ui.btnArea.appendChild(btn);
      if (b === lyricsBtnConfig) {
        ui.lyricsBtn = btn;
        setupUploadMenu(btn);
      }
      if (b === shareBtnConfig) {
        ui.shareBtn = btn;
      }
      if (b === trashBtnConfig) setupDeleteDialog(btn);
      if (b === settingsBtnConfig) ui.settingsBtn = btn;
    });

    ui.input = createEl('input');
    ui.input.type = 'file';
    ui.input.accept = '.lrc,.txt';
    ui.input.style.display = 'none';
    ui.input.onchange = handleUpload;
    document.body.appendChild(ui.input);
    info.append(ui.title, ui.artist, ui.btnArea);
    leftCol.append(ui.artwork, info);
    ui.lyrics = createEl('div', 'my-lyrics-container');
    ui.wrapper.append(leftCol, ui.lyrics);
    document.body.appendChild(ui.wrapper);
    setupAutoHideEvents();
  }

  async function loadLyrics(meta) {
    if (!config.deepLKey) config.deepLKey = await storage.get('ytm_deepl_key');
    const cachedTrans = await storage.get('ytm_trans_enabled');
    if (cachedTrans !== null && cachedTrans !== undefined) config.useTrans = cachedTrans;
    const mainLangStored = await storage.get('ytm_main_lang');
    const subLangStored = await storage.get('ytm_sub_lang');
    if (mainLangStored) config.mainLang = mainLangStored;
    if (subLangStored !== null && subLangStored !== undefined) config.subLang = subLangStored;
    const uiLangStored = await storage.get('ytm_ui_lang');
    if (uiLangStored) config.uiLang = uiLangStored;

    const thisKey = `${meta.title}///${meta.artist}`;
    if (thisKey !== currentKey) return;
    let cached = await storage.get(thisKey);
    isFallbackLyrics = false;
    dynamicLines = null;
    lyricsCandidates = null;
    selectedCandidateId = null;
    lyricsRequests = null;
    lyricsConfig = null;
    let data = null;
    let noLyricsCached = false;
    if (cached !== null && cached !== undefined) {
      if (cached === NO_LYRICS_SENTINEL) {
        noLyricsCached = true;
      } else if (typeof cached === 'string') {
        data = cached;
      } else if (typeof cached === 'object') {
        if (typeof cached.lyrics === 'string') data = cached.lyrics;
        if (Array.isArray(cached.dynamicLines)) dynamicLines = cached.dynamicLines;
        if (cached.noLyrics) noLyricsCached = true;
        if (cached.githubFallback) isFallbackLyrics = true;
        if (Array.isArray(cached.candidates)) lyricsCandidates = cached.candidates;
        if (Array.isArray(cached.requests)) lyricsRequests = cached.requests;
        if (cached.config) lyricsConfig = cached.config;
      }
    }
    refreshCandidateMenu();
    refreshLockMenu();
    if (!data && noLyricsCached) {
      if (thisKey !== currentKey) return;
      renderLyrics([]);
      return;
    }
    if (!data && !noLyricsCached) {
      let gotLyrics = false;
      try {
        const track = meta.title.replace(/\s*[\(-\[].*?[\)-]].*/, '');
        const artist = meta.artist;
        const youtube_url = getCurrentVideoUrl();
        const video_id = getCurrentVideoId();
        const res = await new Promise(resolve => {
          chrome.runtime.sendMessage(
            { type: 'GET_LYRICS', payload: { track, artist, youtube_url, video_id } },
            resolve
          );
        });
        console.log('[CS] GET_LYRICS response:', res);
        lyricsRequests = Array.isArray(res?.requests) ? res.requests : null;
        lyricsConfig = res?.config || null;
        lyricsCandidates = Array.isArray(res?.candidates) ? res.candidates : null;
        refreshCandidateMenu();
        refreshLockMenu();
        isFallbackLyrics = !!res?.githubFallback;
        if (isFallbackLyrics) showToast('APIが応答しないため、GitHubの歌詞を使用しました');
        if (res?.success && typeof res.lyrics === 'string' && res.lyrics.trim()) {
          data = res.lyrics;
          gotLyrics = true;
          if (Array.isArray(res.dynamicLines) && res.dynamicLines.length) dynamicLines = res.dynamicLines;
          if (thisKey === currentKey) {
            storage.set(thisKey, {
              lyrics: data,
              dynamicLines: dynamicLines || null,
              noLyrics: false,
              githubFallback: isFallbackLyrics,
              candidates: lyricsCandidates || null,
              requests: lyricsRequests || null,
              config: lyricsConfig || null
            });
          }
        } else {
          console.warn('Lyrics API returned no lyrics or success=false');
        }
      } catch (e) {
        console.error('GET_LYRICS failed', e);
      }
      if (!gotLyrics && thisKey === currentKey) {
        storage.set(thisKey, NO_LYRICS_SENTINEL);
        noLyricsCached = true;
      }
    }
    if (thisKey !== currentKey) return;
    if (!data) {
      renderLyrics([]);
      refreshCandidateMenu();
      refreshLockMenu();
      return;
    }
    await applyLyricsText(data);
  }

  function renderLyrics(data) {
    if (!ui.lyrics) return;
    ui.lyrics.innerHTML = '';
    ui.lyrics.scrollTop = 0;
    const hasData = Array.isArray(data) && data.length > 0;
    document.body.classList.toggle('ytm-no-lyrics', !hasData);
    document.body.classList.toggle('ytm-has-timestamp', hasTimestamp);
    document.body.classList.toggle('ytm-no-timestamp', !hasTimestamp);
    data.forEach((line, index) => {
      const row = createEl('div', '', 'lyric-line');
      const mainSpan = createEl('span', '', 'lyric-main');
      const dyn = dynamicLines && dynamicLines[index];
      if (dyn && Array.isArray(dyn.chars) && dyn.chars.length) {
        dyn.chars.forEach((ch, ci) => {
          const chSpan = createEl('span', '', 'lyric-char');
          chSpan.textContent = ch.c;
          chSpan.dataset.charIndex = String(ci);
          if (typeof ch.t === 'number') {
            chSpan.dataset.time = String(ch.t / 1000);
          }
          chSpan.classList.add('char-pending');
          mainSpan.appendChild(chSpan);
        });
      } else {
        mainSpan.textContent = line.text;
      }
      row.appendChild(mainSpan);
      if (line.translation) {
        const subSpan = createEl('span', '', 'lyric-translation', line.translation);
        row.appendChild(subSpan);
        row.classList.add('has-translation');
      }
      row.onclick = () => {
        if (shareMode) {
          handleShareLineClick(index);
          return;
        }
        if (!hasTimestamp || line.time == null) return;
        const v = document.querySelector('video');
        if (v) v.currentTime = line.time;
      };
      ui.lyrics.appendChild(row);
    });
    updateShareSelectionHighlight();
  }

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !currentKey) return;
    const r = new FileReader();
    r.onload = (ev) => {
      storage.set(currentKey, ev.target.result);
      currentKey = null;
    };
    r.readAsText(file);
    e.target.value = '';
  };

  function startLyricRafLoop() {
    if (lyricRafId !== null) return;
    const loop = () => {
      const v = document.querySelector('video');
      if (!v || v.readyState === 0) {
        lyricRafId = requestAnimationFrame(loop);
        return;
      }
      if (document.body.classList.contains('ytm-custom-layout') && lyricsData.length && hasTimestamp && !v.paused && !v.ended) {
        const t = v.currentTime;
        if (t !== lastTimeForChars) {
          lastTimeForChars = t;
          updateLyricHighlight(t);
        }
      }
      lyricRafId = requestAnimationFrame(loop);
    };
    lyricRafId = requestAnimationFrame(loop);
  }

  function updateLyricHighlight(currentTime) {
    if (!document.body.classList.contains('ytm-custom-layout') || !lyricsData.length) return;
    if (!hasTimestamp) return;
    const t = currentTime;
    let idx = lyricsData.findIndex(l => l.time > t) - 1;
    if (idx < 0) idx = lyricsData[lyricsData.length - 1].time <= t ? lyricsData.length - 1 : -1;
    const current = lyricsData[idx];
    const next = lyricsData[idx + 1];
    const isInterlude = current && next && (next.time - current.time > 10) && (t - current.time > 6);
    const rows = document.querySelectorAll('.lyric-line');
    rows.forEach((r, i) => {
      if (i === idx && !isInterlude) {
        const firstActivate = (i !== lastActiveIndex);
        if (!r.classList.contains('active')) {
          r.classList.add('active');
        }
        if (r.classList.contains('has-translation')) {
          r.classList.add('show-translation');
        }
        if (firstActivate) {
          r.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
          ReplayManager.incrementLyricCount();
        }
        if (dynamicLines && dynamicLines[i] && Array.isArray(dynamicLines[i].chars)) {
          const charSpans = r.querySelectorAll('.lyric-char');
          charSpans.forEach(sp => {
            const tt = parseFloat(sp.dataset.time || '0');
            if (!Number.isFinite(tt)) return;
            if (tt <= t) {
              if (!sp.classList.contains('char-active')) {
                sp.classList.add('char-active');
                sp.classList.remove('char-pending');
              }
            } else {
              if (!sp.classList.contains('char-pending')) {
                sp.classList.remove('char-active');
                sp.classList.add('char-pending');
              }
            }
          });
        }
      } else {
        r.classList.remove('active');
        r.classList.remove('show-translation');
        if (dynamicLines && dynamicLines[i]) {
          const charSpans = r.querySelectorAll('.lyric-char');
          charSpans.forEach(sp => {
            if (!sp.classList.contains('char-pending')) {
              sp.classList.remove('char-active');
              sp.classList.add('char-pending');
            }
          });
        }
      }
    });
    lastActiveIndex = isInterlude ? -1 : idx;
  }

  function onShareButtonClick() {
    if (!lyricsData.length) {
      showToast('共有できる歌詞がありません');
      return;
    }
    shareMode = !shareMode;
    shareStartIndex = null;
    shareEndIndex = null;
    if (shareMode) {
      document.body.classList.add('ytm-share-select-mode');
      if (ui.shareBtn) ui.shareBtn.classList.add('share-active');
      showToast('共有したい歌詞の開始行と終了行をクリックしてください');
    } else {
      document.body.classList.remove('ytm-share-select-mode');
      if (ui.shareBtn) ui.shareBtn.classList.remove('share-active');
    }
    updateShareSelectionHighlight();
  }

  function handleShareLineClick(index) {
    if (!shareMode) return;
    if (!lyricsData.length) return;
    if (shareStartIndex == null) {
      shareStartIndex = index;
      shareEndIndex = null;
      updateShareSelectionHighlight();
      return;
    }
    if (shareEndIndex == null) {
      shareEndIndex = index;
      updateShareSelectionHighlight();
      finalizeShareSelection();
      return;
    }
    shareStartIndex = index;
    shareEndIndex = null;
    updateShareSelectionHighlight();
  }

  function updateShareSelectionHighlight() {
    if (!ui.lyrics) return;
    const rows = ui.lyrics.querySelectorAll('.lyric-line');
    rows.forEach(r => {
      r.classList.remove('share-select');
      r.classList.remove('share-select-range');
      r.classList.remove('share-select-start');
      r.classList.remove('share-select-end');
    });
    if (!shareMode || shareStartIndex == null || !lyricsData.length) return;
    const max = lyricsData.length ? lyricsData.length - 1 : 0;
    let s, e;
    if (shareEndIndex == null) {
      const idx = Math.max(0, Math.min(shareStartIndex, max));
      s = idx;
      e = idx;
    } else {
      const minIdx = Math.min(shareStartIndex, shareEndIndex);
      const maxIdx = Math.max(shareStartIndex, shareEndIndex);
      s = Math.max(0, Math.min(minIdx, max));
      e = Math.max(0, Math.min(maxIdx, max));
    }
    for (let i = s; i <= e && i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      row.classList.add('share-select-range');
      if (i === s) row.classList.add('share-select-start');
      if (i === e) row.classList.add('share-select-end');
    }
  }

  function getShareSelectionInfo() {
    if (!lyricsData.length || shareStartIndex == null) return null;
    const max = lyricsData.length - 1;
    let s, e;
    if (shareEndIndex == null) {
      const idx = Math.max(0, Math.min(shareStartIndex, max));
      s = idx;
      e = idx;
    } else {
      const minIdx = Math.min(shareStartIndex, shareEndIndex);
      const maxIdx = Math.max(shareStartIndex, shareEndIndex);
      s = Math.max(0, Math.min(minIdx, max));
      e = Math.max(0, Math.min(maxIdx, max));
    }
    const parts = [];
    for (let i = s; i <= e; i++) {
      if (!lyricsData[i]) continue;
      let t = (lyricsData[i].text || '').trim();
      if (!t && lyricsData[i].translation) {
        t = String(lyricsData[i].translation).trim();
      }
      if (t) parts.push(t);
    }
    const phrase = parts.join('\n');
    let timeMs = 0;
    if (hasTimestamp && lyricsData[s] && typeof lyricsData[s].time === 'number') {
      timeMs = Math.round(lyricsData[s].time * 1000);
    } else {
      const v = document.querySelector('video');
      if (v && typeof v.currentTime === 'number') {
        timeMs = Math.round(v.currentTime * 1000);
      }
    }
    return { phrase, timeMs };
  }

  function normalizeToHttps(url) {
    if (!url) return url;
    try {
      const u = new URL(url, 'https://lrchub.coreone.work');
      u.protocol = 'https:';
      return u.toString();
    } catch (e) {
      if (url.startsWith('http://')) {
        return 'https://' + url.slice(7);
      }
      return url;
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return Promise.resolve();
    }
  }

  async function finalizeShareSelection() {
    const info = getShareSelectionInfo();
    if (!info || !info.phrase) {
      showToast('選択された歌詞が空です');
      return;
    }
    const youtube_url = getCurrentVideoUrl();
    const video_id = getCurrentVideoId();
    const lang = (config.mainLang && config.mainLang !== 'original') ? config.mainLang : 'ja';
    try {
      const res = await new Promise(resolve => {
        chrome.runtime.sendMessage(
          { type: 'SHARE_REGISTER', payload: { youtube_url, video_id, phrase: info.phrase, lang, time_ms: info.timeMs } },
          resolve
        );
      });
      if (!res || !res.success) {
        console.error('Share register failed:', res && res.error);
        showToast('共有に失敗しました');
        return;
      }
      let shareUrl = (res.data && res.data.share_url) || '';
      shareUrl = normalizeToHttps(shareUrl);
      if (!shareUrl && video_id) {
        const sec = Math.round((info.timeMs || 0) / 1000);
        shareUrl = `https://lrchub.coreone.work/s/${video_id}/${sec}`;
      }
      if (shareUrl) {
        await copyToClipboard(shareUrl);
        showToast('共有リンクをコピーしました');
      } else {
        showToast('共有リンクの取得に失敗しました');
      }
    } catch (e) {
      console.error('Share register error', e);
      showToast('共有に失敗しました');
    } finally {
      shareMode = false;
      shareStartIndex = null;
      shareEndIndex = null;
      document.body.classList.remove('ytm-share-select-mode');
      if (ui.shareBtn) ui.shareBtn.classList.remove('share-active');
      updateShareSelectionHighlight();
    }
  }

  async function sendLockRequest(requestId) {
    const youtube_url = getCurrentVideoUrl();
    const video_id = getCurrentVideoId();
    const reqInfo = Array.isArray(lyricsRequests)
      ? lyricsRequests.find(r => r.id === requestId || r.request === requestId || (r.aliases || []).includes(requestId))
      : null;
    try {
      const res = await new Promise(resolve => {
        chrome.runtime.sendMessage(
          { type: 'SELECT_LYRICS_CANDIDATE', payload: { youtube_url, video_id, request: requestId } },
          resolve
        );
      });
      if (res?.success) {
        showToast('歌詞を確定しました');
        if (reqInfo) {
          reqInfo.locked = true;
          reqInfo.available = false;
          if (!lyricsConfig) lyricsConfig = {};
          if (reqInfo.target === 'sync') lyricsConfig.SyncLocked = true;
          else if (reqInfo.target === 'dynamic') lyricsConfig.dynmicLock = true;
        }
        refreshLockMenu();
      } else {
        const msg = res?.error || (res?.raw && (res.raw.message || res.raw.code)) || '歌詞の確定に失敗しました';
        showToast(msg);
      }
    } catch (e) {
      console.error('lock request error', e);
      showToast('歌詞の確定に失敗しました');
    }
  }

  const tick = async () => {
    if (!document.getElementById('my-mode-toggle')) {
      const rc = document.querySelector('.right-controls-buttons');
      if (rc) {
        const btn = createEl('button', 'my-mode-toggle', '', 'IMMERSION');
        btn.onclick = () => {
          config.mode = !config.mode;
          document.body.classList.toggle('ytm-custom-layout', config.mode);
        };
        rc.prepend(btn);
      }
    }
    const layout = document.querySelector('ytmusic-app-layout');
    const isPlayerOpen = layout?.hasAttribute('player-page-open');
    if (!config.mode || !isPlayerOpen) {
      document.body.classList.remove('ytm-custom-layout');
      return;
    }
    document.body.classList.add('ytm-custom-layout');
    initLayout();
    (function patchSliders() {
      const sliders = document.querySelectorAll('ytmusic-player-bar .middle-controls tp-yt-paper-slider');
      sliders.forEach(s => {
        try {
          s.style.boxSizing = 'border-box';
          s.style.paddingLeft = '20px';
          s.style.paddingRight = '20px';
          s.style.minWidth = '0';
        } catch (e) { }
      });
    })();
    const meta = getMetadata();
    if (!meta) return;
    const key = `${meta.title}///${meta.artist}`;
    if (currentKey !== key) {
      currentKey = key;
      lyricsData = [];
      dynamicLines = null;
      lyricsCandidates = null;
      selectedCandidateId = null;
      lyricsRequests = null;
      lyricsConfig = null;
      shareMode = false;
      shareStartIndex = null;
      shareEndIndex = null;
      document.body.classList.remove('ytm-share-select-mode');
      if (ui.shareBtn) ui.shareBtn.classList.remove('share-active');
      
      if (ui.queuePanel && ui.queuePanel.classList.contains('visible')) {
          QueueManager.onSongChanged();
      }

      updateMetaUI(meta);
      refreshCandidateMenu();
      refreshLockMenu();
      if (ui.lyrics) ui.lyrics.scrollTop = 0;
      loadLyrics(meta);
    }
  };

function updateMetaUI(meta) {
  ui.title.innerText = meta.title;

  if (meta.src) {
    ui.artwork.innerHTML = `<img src="${meta.src}" crossorigin="anonymous">`;
    ui.bg.style.backgroundImage = `url(${meta.src})`;
  }
  ui.lyrics.innerHTML = '<div class="lyric-loading" style="opacity:0.5; padding:20px;">Loading...</div>';
[]
  const byline = document.querySelector('ytmusic-player-bar .byline.style-scope.ytmusic-player-bar.complex-string');
  
  if (!byline) {
    ui.artist.innerText = meta.artist;
    return;
  }
  const artistLinkElements = Array.from(
    byline.querySelectorAll('a.yt-simple-endpoint')
  ).filter(a => {
    const href = a.href || '';
    return href.includes('channel/') || href.includes('/channel/');
  });

  if (artistLinkElements.length === 0) {
    ui.artist.innerText = meta.artist;
    return;
  }

  let artistHTML = '';
  
  artistLinkElements.forEach((link, index) => {
    const name = link.textContent.trim();
    const url = link.href;

    artistHTML += `<a href="${url}" target="_blank" style="color:inherit; text-decoration:none;"> ${name} </a>`;

    if (index < artistLinkElements.length - 1) {
      artistHTML += ', ';
    }
  });

  ui.artist.innerHTML = artistHTML;
}

  // 初期化
  ReplayManager.init();
  QueueManager.init();

  console.log('YTM Immersion loaded.');
  setInterval(tick, 1000);
  startLyricRafLoop();
})();

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}