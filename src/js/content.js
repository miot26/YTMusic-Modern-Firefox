(function() {
    // --- State & Constants ---
    let currentSongKey = null;
    let lyricsData = [];
    let lyricLines = [];
    let isModeEnabled = true;
    let lastSongChangeTime = 0;
    
    // --- DOM Elements Cache ---
    let lyricsContainer = null;
    let customWrapper = null;
    let customBg = null;
    let titleEl = null;
    let artistEl = null;
    let artworkContainer = null;
    let progressBarClone = null;
    
    const INIT_TIME = 2000; // 歌詞の更新が完了するまでの待機時間（ms）

    // --- API & Parser ---
    async function fetchLyrics(title, artist) {
        try {
            const cleanTitle = title.replace(/\s*[\(-\[].*?[\)-]].*/, "").trim();
            const cleanArtist = artist.replace(/\s*[\(-\[].*?[\)-]].*/, "").trim();
            const query = encodeURIComponent(`${cleanTitle} ${cleanArtist}`);
            
            const response = await fetch(`https://lrclib.net/api/search?q=${query}`);
            const data = await response.json();

            let match = data.find(item => {
                if (!item.syncedLyrics) return false;
                const itemArtist = item.artistName.toLowerCase();
                const targetArtist = cleanArtist.toLowerCase();
                const isArtistMatch = itemArtist.includes(targetArtist) || targetArtist.includes(itemArtist);
                const itemTitle = item.trackName.toLowerCase();
                const targetTitle = cleanTitle.toLowerCase();
                const isTitleMatch = itemTitle.includes(targetTitle) || targetTitle.includes(itemTitle);
                return isArtistMatch && isTitleMatch;
            });

            if (!match) match = data.find(item => item.syncedLyrics);
            if (match) return parseLRC(match.syncedLyrics);
            
            return [{ time: 0, text: "Lyrics not found" }];
        } catch (e) { return [{ time: 0, text: "" }]; }
    }

    function parseLRC(lrc) {
        const lines = lrc.split('\n');
        const result = [];
        const timeRegex = /\[(\d{2})\:(\d{2})\.(\d{2,3})\]/;
        lines.forEach(line => {
            const match = line.match(timeRegex);
            if (match) {
                const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 100; 
                const text = line.replace(timeRegex, '').trim();
                if (text) result.push({ time, text });
            }
        });
        return result;
    }

    // --- Song Info ---
    function getSongInfo() {
        if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
            const meta = navigator.mediaSession.metadata;
            return {
                title: meta.title,
                artist: meta.artist,
                artwork: meta.artwork.length > 0 ? meta.artwork[meta.artwork.length - 1].src : null
            };
        }
        const titleEl = document.querySelector('yt-formatted-string.title.style-scope.ytmusic-player-bar');
        const subtitleEl = document.querySelector('.byline.style-scope.ytmusic-player-bar');
        if (!titleEl || !subtitleEl) return null;
        return { 
            title: titleEl.textContent, 
            artist: subtitleEl.textContent.split('•')[0].trim(),
            artwork: null 
        };
    }

    // --- UI/Layout Management ---

    /**
     * カスタムレイアウトの適用状態を判定し、DOMにクラスを付与/削除する
     * @returns {boolean} カスタムモードが現在有効かどうか
     */
    function applyLayout() {
        const layout = document.querySelector('ytmusic-app-layout');
        const isPlayerOpen = layout && layout.hasAttribute('player-page-open');
        const btn = document.getElementById('my-mode-toggle');

        if (btn) {
            btn.style.display = isPlayerOpen ? "inline-block" : "none";
            updateButtonStyle(btn);
        }

        const shouldApply = isModeEnabled && isPlayerOpen;

        document.body.classList.toggle('ytm-custom-layout', shouldApply);
        if (customBg) customBg.style.display = shouldApply ? 'block' : 'none';
        if (customWrapper) customWrapper.style.display = shouldApply ? 'flex' : 'none';

        if (shouldApply) {
            setupProgressBarClone();
        } else if (progressBarClone && progressBarClone.parentNode) {
            progressBarClone.parentNode.removeChild(progressBarClone);
            progressBarClone = null;
        }

        return shouldApply;
    }

    function setupLayout() {
        if (!document.getElementById('ytm-custom-bg')) {
            customBg = document.createElement('div');
            customBg.id = 'ytm-custom-bg';
            document.body.appendChild(customBg);
        }
        if (!document.getElementById('ytm-custom-wrapper')) {
            customWrapper = document.createElement('div');
            customWrapper.id = 'ytm-custom-wrapper';
            document.body.appendChild(customWrapper);
            
            const customLeftCol = document.createElement('div');
            customLeftCol.id = 'ytm-custom-left-col';
            artworkContainer = document.createElement('div');
            artworkContainer.id = 'ytm-artwork-container';
            const infoArea = document.createElement('div');
            infoArea.id = 'ytm-custom-info-area';
            titleEl = document.createElement('div');
            titleEl.id = 'ytm-custom-title';
            artistEl = document.createElement('div');
            artistEl.id = 'ytm-custom-artist';
            
            infoArea.appendChild(titleEl);
            infoArea.appendChild(artistEl);
            customLeftCol.appendChild(artworkContainer);
            customLeftCol.appendChild(infoArea);
            
            lyricsContainer = document.createElement('div');
            lyricsContainer.id = 'my-lyrics-container';
            
            customWrapper.appendChild(customLeftCol);
            customWrapper.appendChild(lyricsContainer);
        } else {
            // Re-cache elements
            customWrapper = document.getElementById('ytm-custom-wrapper');
            lyricsContainer = document.getElementById('my-lyrics-container');
            titleEl = document.getElementById('ytm-custom-title');
            artistEl = document.getElementById('ytm-custom-artist');
            artworkContainer = document.getElementById('ytm-artwork-container');
            customBg = document.getElementById('ytm-custom-bg');
        }
    }

    function updateLyricsUI(data) {
        if (!lyricsContainer) return;
        lyricsContainer.innerHTML = '';

        data.forEach(line => {
            const p = document.createElement('div');
            p.className = 'lyric-line';
            p.innerText = line.text;
            p.onclick = () => { 
                const v = document.querySelector('video'); 
                if(v) v.currentTime = line.time; 
            };
            lyricsContainer.appendChild(p);
        });
        lyricLines = lyricsContainer.querySelectorAll('.lyric-line');
        // スクロールを先頭に設定（アクティブ行の自動スクロールより前に実行）
        lyricsContainer.scrollTo(0, 0);
    }

    function setupToggleButton() {
        const rightControls = document.querySelector('.right-controls-buttons.style-scope.ytmusic-player-bar');
        if (!rightControls) return;

        let btn = document.getElementById('my-mode-toggle');

        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'my-mode-toggle';
            btn.innerText = 'IMMERSION';
            btn.onclick = () => {
                isModeEnabled = !isModeEnabled;
                applyLayout();
            };
            rightControls.prepend(btn);
        }
    }

    function updateButtonStyle(btn) {
        if (isModeEnabled) {
            btn.style.cssText = `
                opacity: 1; 
                box-shadow: 0 0 10px rgba(255,255,255,0.5); 
                background: #fff; 
                color: #000; 
                font-weight: bold;
            `;
        } else {
            btn.style.cssText = `
                opacity: 0.6; 
                box-shadow: none; 
                background: rgba(255,255,255,0.1); 
                color: #fff; 
                font-weight: normal;
            `;
        }
    }

    // --- Progress Bar Handle Clone ---
    function setupProgressBarClone() {
        const playerBar = document.querySelector('body.ytm-custom-layout ytmusic-player-bar');
        if (!playerBar) return;

        // 既存のクローンを削除
        if (progressBarClone && progressBarClone.parentNode) {
            progressBarClone.parentNode.removeChild(progressBarClone);
        }

        // スライダーハンドルを探す
        const handle = playerBar.querySelector('[role="slider"] [class*="thumb"], [role="slider"] [class*="handle"], [class*="progress"] [class*="thumb"]');
        if (!handle) return;

        // ハンドルをクローン
        progressBarClone = handle.cloneNode(true);
        progressBarClone.id = 'ytm-progress-bar-clone';
        progressBarClone.style.cssText = `
            position: fixed !important;
            pointer-events: none !important;
            z-index: 301 !important;
        `;

        document.body.appendChild(progressBarClone);
        syncProgressBarClone();
    }

    function syncProgressBarClone() {
        if (!progressBarClone) return;

        const playerBar = document.querySelector('body.ytm-custom-layout ytmusic-player-bar');
        if (!playerBar) return;

        const handle = playerBar.querySelector('[role="slider"] [class*="thumb"], [role="slider"] [class*="handle"], [class*="progress"] [class*="thumb"]');
        if (!handle) return;

        // ハンドルのスタイルをコピー
        const rect = handle.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(handle);

        progressBarClone.style.cssText = `
            position: fixed !important;
            pointer-events: none !important;
            z-index: 301 !important;
            top: ${rect.top}px !important;
            left: ${rect.left}px !important;
            width: ${rect.width}px !important;
            height: ${rect.height}px !important;
            background: ${computedStyle.background || computedStyle.backgroundColor} !important;
            border-radius: ${computedStyle.borderRadius} !important;
            box-shadow: ${computedStyle.boxShadow} !important;
            transform: ${computedStyle.transform} !important;
        `;
    }

    // --- Main Logic ---

    function handleTimeUpdate(video) {
        if (!document.body.classList.contains('ytm-custom-layout')) return;
        if (!lyricsData || lyricsData.length === 0) return;

        const currentTime = video.currentTime;

        if (Date.now() - lastSongChangeTime < INIT_TIME) return; 

        let activeIndex = -1;
        for (let i = 0; i < lyricsData.length; i++) {
            if (currentTime >= lyricsData[i].time) activeIndex = i; else break;
        }
        
        if (activeIndex !== -1 && lyricLines[activeIndex]) {
            const activeLine = lyricLines[activeIndex];
            if (!activeLine.classList.contains('active')) {
                lyricLines.forEach(l => l.classList.remove('active'));
                activeLine.classList.add('active');
                // 曲開始時はauto、以降はsmooth
                const behavior = (activeIndex === 0) ? 'auto' : 'smooth';
                // 次の描画フレームで実行してレイアウト確定後にスクロール
                requestAnimationFrame(() => {
                    activeLine.scrollIntoView({ behavior: behavior, block: "center" });
                });
            }
        }

        // プログレスバーのクローンを常に同期
        syncProgressBarClone();
    }

    async function checkSongAndFetch() {
        const video = document.querySelector('video');
        if (!video) return;
        
        setupLayout();
        const isActive = applyLayout();
        if (!isActive) return;

        const info = getSongInfo();
        if (!info || !info.title) return;
        
        const songId = `${info.title}///${info.artist}`;
        
        if (currentSongKey !== songId) {
            currentSongKey = songId;
            lastSongChangeTime = Date.now();

            if(titleEl) titleEl.innerText = info.title;
            if(artistEl) artistEl.innerText = info.artist;
            if(info.artwork) {
                if(artworkContainer) artworkContainer.innerHTML = `<img src="${info.artwork}" crossorigin="anonymous">`;
                if(customBg) customBg.style.backgroundImage = `url(${info.artwork})`;
            }
            
            lyricsData = [];
            if(lyricsContainer) {
                lyricsContainer.innerHTML = '<div class="lyric-line" style="opacity:0.5">Loading...</div>';
                lyricsContainer.scrollTo(0, 0);
            }
            
            const fetchedData = await fetchLyrics(info.title, info.artist);
            
            // 競合状態を防ぐため、fetch完了後に再度IDを確認
            if (currentSongKey === songId) {
                lyricsData = fetchedData;
                updateLyricsUI(lyricsData);
            }
        }
        
        // timeupdateリスナーのセットアップ
        if (!video.dataset.hasCustomListener) {
            video.dataset.hasCustomListener = "true";
            video.addEventListener('timeupdate', () => handleTimeUpdate(video));
        }
    }

    function init() {
        // トグルボタンとレイアウト状態の監視 (200ms間隔で即応性重視)
        setInterval(() => {
            setupToggleButton();
            applyLayout();
        }, 200);

        // 曲情報の監視と歌詞のフェッチ (1000ms間隔)
        setInterval(checkSongAndFetch, 1000);
    }

    init();
})();