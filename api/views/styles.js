function styles() {
  return `
:root{
  --bg:#07090d;
  --panel:#10141b;
  --panel2:#151a22;
  --border:rgba(255,255,255,.09);
  --text:#f5f7fa;
  --muted:#8d96a3;
  --accent:#e51b23;
  --accent2:#ff3440;
  --success:#24d17e;
}

*{
  box-sizing:border-box;
}

html{
  scroll-behavior:smooth;
}

body{
  margin:0;
  min-height:100vh;
  overflow-x:hidden;
  color:var(--text);
  background:
    radial-gradient(
      circle at 75% 5%,
      rgba(229,27,35,.10),
      transparent 28%
    ),
    radial-gradient(
      circle at 10% 50%,
      rgba(255,255,255,.025),
      transparent 25%
    ),
    var(--bg);
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.doppio-one-regular {
  font-family: "Doppio One", sans-serif;
  font-weight: 400;
  font-style: normal;
}

.ambient{
  position:fixed;
  pointer-events:none;
  filter:blur(100px);
  opacity:.16;
  z-index:0;
}

.ambient-one{
  width:300px;
  height:300px;
  background:#e51b23;
  top:-150px;
  right:10%;
}

.ambient-two{
  width:250px;
  height:250px;
  background:#6d28d9;
  bottom:-100px;
  left:5%;
}

.main-container{
  position:relative;
  z-index:1;
  max-width:1600px;
  margin:auto;
  padding:26px 30px 60px;
}

.top-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
  padding:8px 4px 24px;
}

.header-actions{
  display:flex;
  align-items:center;
  gap:10px;
}

.header-action{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:42px;
  height:38px;
  padding:0 12px;
  border:1px solid var(--border);
  border-radius:12px;
  background:rgba(255,255,255,.03);
  color:var(--text);
  text-decoration:none;
  font-weight:600;
  transition:transform .2s ease, border-color .2s ease, background .2s ease;
}

.header-action img {
  filter: brightness(0) invert(1);
}

#now-playing-program img{
  width:25px;
  margin:-2px 0 0 -2px;
  vertical-align:middle;
  filter: brightness(0) saturate(100%)
          invert(78%) sepia(8%)
          saturate(390%) hue-rotate(175deg)
          brightness(88%) contrast(87%) !important;
}

#now-playing-program img.jio-epg-badge{
  width:14px;
  height:14px;
  margin:0 0 0 4px;
  vertical-align:middle;
  filter:none !important;
}

.header-action:hover{
  transform:translateY(-1px);
  border-color:rgba(255,255,255,.18);
  background:rgba(255,255,255,.06);
}

.brand-area{
  display:flex;
  align-items:center;
  gap:14px;
}

.brand-logo{
  width:48px;
  height:48px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:14px;
  background:
    linear-gradient(
      145deg,
      rgba(255,255,255,.12),
      rgba(255,255,255,.025)
    );
  border:1px solid var(--border);
  box-shadow:0 10px 35px rgba(0,0,0,.35);
  overflow:hidden;
}

.brand-logo img{
  width:36px;
  height:auto;
}

.brand-area h1{
  margin:0;
  font-size:1.55rem;
  font-weight:750;
  letter-spacing:-.04em;
}

.brand-area p{
  margin:3px 0 0;
  color:var(--muted);
  font-size:.78rem;
}

.channel-count{
  display:flex;
  flex-direction:column;
  align-items:flex-end;
}

.channel-count strong{
  font-size:1.2rem;
  font-weight:750;
}

.channel-count span{
  color:var(--muted);
  font-size:.7rem;
  text-transform:uppercase;
  letter-spacing:.08em;
}

.filter-panel{
  position:relative;
  z-index:30;
  margin-bottom:28px;
  padding:10px;
  border:1px solid var(--border);
  border-radius:17px;
  background:rgba(17,21,28,.82);
  box-shadow:
    0 15px 50px rgba(0,0,0,.25);
  backdrop-filter:blur(25px);
}

.filter-panel form{
  display:flex;
  gap:8px;
  align-items:stretch;
}

.search-box{
  position:relative;
  flex:2 1 280px;
}

.search-icon{
  position:absolute;
  left:15px;
  top:50%;
  transform:translateY(-50%);
  color:#9da5b1;
  font-size:20px;
  pointer-events:none;
}

.modern-input,
.filter-control{
  width:100%;
  min-height:44px;
  border:1px solid rgba(255,255,255,.07);
  outline:none;
  color:#fff;
  background:#ffffff08;
  transition:.2s ease;
}

.modern-input{
  padding:0 15px 0 43px;
  border-radius:11px;
}

.modern-input::placeholder{
  color:#737d89;
}

.modern-input:focus,
.filter-control:focus{
  border-color:rgba(229,27,35,.65);
  background:#ffffff0d;
  box-shadow:0 0 0 3px rgba(229,27,35,.08);
}

.country-picker{
  position:relative;
  flex:1 1 180px;
  min-width:0;
}

.filter-control{
  padding:0 13px;
  border-radius:11px;
  text-align:left;
}

button.filter-control{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}

.filter-control span:first-child{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.filter-control img{
  vertical-align:middle;
  margin-right:5px;
}

.category-picker{
  position:relative;
  flex:1 1 180px;
  min-width:0;
}

.search-button{
  min-width:90px;
  padding:0 20px;
  border:0;
  border-radius:11px;
  color:#fff;
  background:
    linear-gradient(
      135deg,
      var(--accent),
      var(--accent2)
    );
  font-weight:700;
  transition:.2s ease;
  box-shadow:0 8px 25px rgba(229,27,35,.18);
}

.search-button:hover{
  transform:translateY(-1px);
  box-shadow:0 12px 30px rgba(229,27,35,.28);
}

.clear-button{
  display:flex;
  align-items:center;
  justify-content:center;
  padding:0 14px;
  color:#adb5c0;
  text-decoration:none;
  border:1px solid var(--border);
  border-radius:11px;
  font-size:.85rem;
  transition:.2s;
}

.clear-button:hover{
  color:#fff;
  background:#ffffff08;
}

.country-picker-menu{
  position:absolute;
  top:calc(100% + 7px);
  left:0;
  min-width:230px;
  max-height:320px;
  overflow-y:auto;
  z-index:100;
  padding:6px;
  border:1px solid rgba(255,255,255,.10);
  border-radius:12px;
  background:#141920;
  box-shadow:
    0 20px 50px rgba(0,0,0,.55);
  backdrop-filter:blur(25px);
}

.country-option{
  display:block;
  width:100%;
  padding:9px 10px;
  border:0;
  border-radius:8px;
  color:#e9edf2;
  background:transparent;
  text-align:left;
  white-space:nowrap;
  transition:.15s;
}

.country-option:hover,
.country-option:focus{
  color:#fff;
  background:#ffffff0d;
}

.country-option img{
  vertical-align:middle;
  margin-right:5px;
}

#player-wrapper{
  position:sticky;
  top:20px;
  z-index:2;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.10);
  border-radius:18px;
  background:#080a0e;
  box-shadow:
    0 25px 70px rgba(0,0,0,.50),
    0 0 0 1px rgba(255,255,255,.02);
}

#player-wrapper
[data-shaka-player-container]{
  position:relative;
  width:100%;
  background:#000;
  aspect-ratio:16/9;
}

#video-player{
  width:100%;
  height:100%;
  aspect-ratio:16/9;
  display:block;
  background:#000;
}

.player-meta{
  background:
    linear-gradient(
      180deg,
      #131820,
      #0d1117
    ) !important;
  border-top:1px solid rgba(255,255,255,.06);
}

.now-playing-info{
  min-width:0;
}

.now-label{
  display:block;
  margin-bottom:4px;
  color:#7e8793;
  font-size:.62rem;
  font-weight:800;
  letter-spacing:.12em;
}

#now-playing-title{
  display:block;
  color:#fff;
  font-size:1rem;
  font-weight:700;
}

#now-playing-status{
  padding:5px 10px;
  border-radius:20px;
  background:#ffffff08;
  font-size:.72rem;
  white-space:nowrap;
}

.live-status{
  display:inline-flex;
  align-items:center;
  gap:6px;
  color:var(--success)!important;
}

.live-status::before{
  content:'';
  width:6px;
  height:6px;
  border-radius:50%;
  background:var(--success);
  box-shadow:0 0 9px var(--success);
  animation:liveBlink 2s infinite;
}

@keyframes liveBlink{
  0%,100%{
    opacity:1;
    box-shadow:0 0 10px var(--success);
  }
  50%{
    opacity:.25;
    box-shadow:0 0 2px var(--success);
  }
}

#now-playing-program{
  min-height:18px;
  color:#b9c1cb!important;
}

.player-footer{
  display:flex;
  justify-content:space-between;
  margin-top:12px;
  padding-top:10px;
  border-top:1px solid rgba(255,255,255,.06);
  color:#6f7885;
  font-size:.66rem;
  text-transform:uppercase;
  letter-spacing:.07em;
}

.player-footer i{
  display:inline-block;
  width:5px;
  height:5px;
  margin-right:5px;
  border-radius:50%;
  background:var(--success);
}

#player-wrapper
.shaka-controls-container{
  font-family:inherit;
}

#player-wrapper
.shaka-bottom-controls{
  padding:0 12px 10px;
}

#player-wrapper
.shaka-overflow-menu,
#player-wrapper
.shaka-settings-menu{
  border-radius:12px;
  overflow:hidden;
}

.section-heading{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:20px;
  margin:5px 2px 18px;
}

.section-kicker{
  display:block;
  margin-bottom:4px;
  color:#707a87;
  font-size:.65rem;
  font-weight:800;
  letter-spacing:.13em;
}

.section-heading h2{
  margin:0;
  color:#fff;
  font-size:1.35rem;
  font-weight:750;
  letter-spacing:-.03em;
}

.result-count{
  color:#6f7885;
  font-size:.72rem;
}

.channel-card{
  height:100%;
  overflow:hidden;
  cursor:pointer;
  border:1px solid rgba(255,255,255,.075);
  border-radius:14px;
  background:
    linear-gradient(
      145deg,
      rgba(25,30,38,.96),
      rgba(14,18,24,.96)
    );
  box-shadow:0 8px 25px rgba(0,0,0,.20);
  transition:
    transform .22s ease,
    border-color .22s ease,
    box-shadow .22s ease,
    background .22s ease;
}

.channel-card:hover{
  transform:translateY(-4px);
  border-color:rgba(229,27,35,.42);
  background:
    linear-gradient(
      145deg,
      rgba(34,39,48,.98),
      rgba(16,20,27,.98)
    );
  box-shadow:
    0 16px 35px rgba(0,0,0,.38),
    0 0 25px rgba(229,27,35,.06);
}

.channel-card:active{
  transform:translateY(-1px);
}

.channel-logo-wrap{
  position:relative;
  height:105px;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:13px;
  overflow:hidden;
  background:
    radial-gradient(
      circle at center,
      rgba(255,255,255,.07),
      transparent 65%
    ),
    #080a0e;
}

.channel-logo{
  width:100%;
  height:100%;
  object-fit:contain;
  transition:transform .25s ease;
}

.channel-quality-badge{
  position:absolute;
  top:8px;
  right:8px;
  z-index:2;
  padding:2px 7px;
  border-radius:8px;
  background:rgb(92 0 4);
  color:#fff;
  font-size:.62rem;
  font-weight:800;
  letter-spacing:.04em;
  text-transform:uppercase;
  box-shadow:0 6px 14px rgba(0,0,0,.28);
  pointer-events:none;
}

.channel-card:hover .channel-logo{
  transform:scale(1.045);
}

.channel-play{
  position:absolute;
  right:9px;
  bottom:8px;
  width:29px;
  height:29px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:50%;
  color:#fff;
  background:rgba(229,27,35,.92);
  box-shadow:0 5px 15px rgba(0,0,0,.45);
  opacity:0;
  transform:scale(.75);
  transition:.2s ease;
}

.channel-card:hover .channel-play{
  opacity:1;
  transform:scale(1);
}

.channel-play span{
  margin-left:2px;
  font-size:11px;
}

.channel-info{
  padding:11px 12px 12px;
}

.channel-name{
  overflow:hidden;
  margin-bottom:6px;
  color:#f4f6f8;
  font-size:.84rem;
  font-weight:700;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.channel-meta{
  display:flex;
  align-items:center;
  gap:5px;
  min-width:0;
  overflow:hidden;
  color:#798390;
  font-size:.68rem;
  white-space:nowrap;
  justify-content: center;
}

.channel-meta span{
  overflow:hidden;
  text-overflow:ellipsis;
}

.channel-tags{
  display:flex;
  gap:4px;
  overflow:hidden;
  margin-top:8px;
  justify-content: center;
}

.channel-category{
  max-width:100%;
  padding:3px 6px;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.06);
  border-radius:5px;
  color:#737d89;
  background:#ffffff04;
  font-size:.57rem;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.empty-state{
  padding:70px 20px;
  text-align:center;
  border:1px dashed rgba(255,255,255,.10);
  border-radius:16px;
  background:#ffffff03;
}

.empty-icon{
  margin-bottom:10px;
  font-size:38px;
  opacity:.6;
}

.empty-state h4{
  font-size:1rem;
}

.empty-state p{
  margin:0;
  color:#727c89;
  font-size:.8rem;
}

.pagination{
  justify-content:center;
  gap:5px;
}

.page-link{
  min-width:36px;
  border:1px solid var(--border);
  border-radius:9px!important;
  color:#aab2bd;
  background:#ffffff04;
  text-align:center;
}

.page-link:hover{
  color:#fff;
  background:#ffffff0b;
  border-color:rgba(229,27,35,.3);
}

.page-item.active .page-link{
  color:#fff;
  border-color:var(--accent);
  background:var(--accent);
  box-shadow:0 5px 20px rgba(229,27,35,.2);
}

@media(max-width:991px){

  #player-wrapper{
    position:relative;
    top:0;
  }

  .section-heading{
    margin-top:10px;
  }

}

@media(max-width:768px){

  .main-container{
    padding:15px 12px 40px;
  }

  .top-header{
    padding-bottom:17px;
  }

  .brand-area h1{
    font-size:1.25rem;
  }

  .brand-area p{
    font-size:.68rem;
  }

  .channel-count{
    display:none;
  }

  .filter-panel{
    padding:8px;
  }

  .filter-panel form{
    flex-wrap:wrap;
  }

  .search-box,
  .country-picker,
  .category-picker,
  .search-button,
  .clear-button{
    flex:1 1 100%;
    width:100%;
  }

  .search-button,
  .clear-button{
    min-height:43px;
  }

  .channel-logo-wrap{
    height:85px;
  }

  .channel-info{
    padding:9px;
  }

  .channel-name{
    font-size:.76rem;
  }

  .channel-category{
    display:none;
  }

  .section-heading h2{
    font-size:1.1rem;
  }

}

@media(max-width:420px){

  .brand-logo{
    width:42px;
    height:42px;
  }

  .brand-logo img{
    width:31px;
  }

  .channel-logo-wrap{
    height:78px;
  }

  .channel-card{
    border-radius:11px;
  }

}

.clock-footer{
  display:flex;
  justify-content:center;
  align-items:center;
  gap:8px;
  padding:12px 0;
  color:#6f7885;
  font-size:.72rem;
  letter-spacing:.06em;
}

.clock-label{
  font-weight:800;
  text-transform:uppercase;
}

#server-clock{
  font-variant-numeric:tabular-nums;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  color:#aab2bd;
}
`;
}

module.exports = {
  styles
};
