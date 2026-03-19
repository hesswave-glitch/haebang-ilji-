// =============================================
// Supabase 연결 설정
// =============================================
const SUPABASE_URL = 'https://tbeikgwdbjmnomyskrpb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_y5HBDSEuv2B1Xnqbu-JULw_kUGNxjVK';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================================
// 날짜 설정
// =============================================
const now = new Date();
const dayNames = ['일','월','화','수','목','금','토'];
const todayKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
const dateStr = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${dayNames[now.getDay()]}요일`;

document.getElementById('meta-left').textContent = dateStr;
document.getElementById('write-date').textContent = dateStr;
document.getElementById('feed-dateline').textContent = dateStr + ' — 오늘의 해방일지';
document.getElementById('meta-right').textContent = 'Supabase 연동\n자정 자동 발행';

const tomorrow = new Date(now); tomorrow.setHours(24,0,0,0);
const diff = tomorrow - now;
const hh = Math.floor(diff/3600000), mm = Math.floor((diff%3600000)/60000);
document.getElementById('next-issue-label').textContent = `자동 발행까지 ${hh}시간 ${mm}분`;

// =============================================
// 상태 변수
// =============================================
let anonOn = true;
let sparkleItems = [];
let timerSec = 300, timerRunning = false, timerIv = null;
let todayEntries = [];
let archives = [];
let nextIssueNum = 1;

// =============================================
// 동기화 상태 표시
// =============================================
function setSyncStatus(status) {
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (status === 'ok') { dot.className = 'sync-dot ok'; label.textContent = '저장됨'; }
  else if (status === 'saving') { dot.className = 'sync-dot saving'; label.textContent = '저장 중...'; }
  else { dot.className = 'sync-dot'; label.textContent = '불러오는 중...'; }
}

function updateTodayCount() {
  document.getElementById('today-count').textContent = todayEntries.length;
}

// =============================================
// 데이터 불러오기
// =============================================
async function loadData() {
  setSyncStatus('loading');
  try {
    // 오늘 미발행 일지
    const { data: entries } = await supabase
      .from('entries')
      .select('*')
      .eq('published', false)
      .order('created_at', { ascending: false });
    todayEntries = entries || [];

    // 발행된 호 목록
    const { data: issues } = await supabase
      .from('issues')
      .select('*')
      .order('issue_number', { ascending: false });
    archives = issues || [];
    nextIssueNum = archives.length > 0 ? archives[0].issue_number + 1 : 1;

    // 자정 자동 발행 체크
    await checkAutoPublish();

    setSyncStatus('ok');
    updateTodayCount();
  } catch(e) {
    console.error(e);
    setSyncStatus('ok');
  }
}

// =============================================
// 자정 자동 발행 체크
// =============================================
async function checkAutoPublish() {
  try {
    const { data: oldest } = await supabase
      .from('entries')
      .select('created_at')
      .eq('published', false)
      .order('created_at', { ascending: true })
      .limit(1);

    if (!oldest || oldest.length === 0) return;

    const entryDate = new Date(oldest[0].created_at);
    const entryDateKey = `${entryDate.getFullYear()}-${entryDate.getMonth()+1}-${entryDate.getDate()}`;

    if (entryDateKey !== todayKey) {
      // 어제 또는 그 이전 데이터가 미발행 상태 → 자동 발행
      await publishIssue(entryDateKey);
    }
  } catch(e) { console.error(e); }
}

// =============================================
// 탭 전환
// =============================================
function switchTab(t) {
  ['write','feed','sparkle','archive'].forEach(id => {
    document.getElementById('tab-'+id).style.display = id === t ? '' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', ['write','feed','sparkle','archive'][i] === t);
  });
  if (t === 'feed') renderFeed();
  if (t === 'archive') renderArchive();
}

// =============================================
// 익명 토글
// =============================================
function toggleAnon() {
  anonOn = !anonOn;
  document.getElementById('anon-toggle').classList.toggle('on', anonOn);
  document.getElementById('anon-label').textContent = anonOn ? '익명으로 공유' : '이름으로 공유';
}

// =============================================
// 일지 저장
// =============================================
async function submitEntry() {
  const text = document.getElementById('lib-text').value.trim();
  if (!text) return;
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  setSyncStatus('saving');
  try {
    const { data, error } = await supabase.from('entries').insert([{
      author: anonOn ? '익명' : '나',
      text,
      type: '해방일지',
      empathy: 0,
      published: false
    }]).select();
    if (error) throw error;
    todayEntries.unshift(data[0]);
    document.getElementById('lib-text').value = '';
    updateTodayCount();
    setSyncStatus('ok');
    switchTab('feed');
  } catch(e) {
    alert('저장 중 오류가 발생했어요. 다시 시도해주세요.');
    console.error(e);
    setSyncStatus('ok');
  }
  btn.disabled = false;
}

// =============================================
// 피드 렌더링
// =============================================
function renderFeed() {
  const g = document.getElementById('feed-grid');
  if (!todayEntries.length) {
    g.innerHTML = '<div class="empty-state">아직 오늘의 일지가 없어요.<br>첫 번째 해방일지를 남겨보세요.</div>';
    return;
  }
  g.innerHTML = todayEntries.map((e, i) => `
    <div class="feed-item">
      <div class="feed-item-meta">
        <span class="feed-byline">${e.author}</span>
        <span class="feed-badge">${e.type}</span>
      </div>
      <div class="feed-text">${e.text}</div>
      <div class="feed-actions">
        <button class="empathy-btn ${e._liked ? 'on' : ''}" onclick="toggleEmpathy(${i})">공감 ${e.empathy}</button>
        <span class="feed-time">${timeAgo(e.created_at)}</span>
      </div>
    </div>`).join('');
}

// =============================================
// 공감
// =============================================
async function toggleEmpathy(i) {
  const entry = todayEntries[i];
  const newVal = entry._liked ? entry.empathy - 1 : entry.empathy + 1;
  entry._liked = !entry._liked;
  entry.empathy = newVal;
  renderFeed();
  await supabase.from('entries').update({ empathy: newVal }).eq('id', entry.id);
}

// =============================================
// 시간 표시
// =============================================
function timeAgo(dateStr) {
  if (!dateStr) return '방금';
  const diff = Math.floor((new Date() - new Date(dateStr)) / 60000);
  if (diff < 1) return '방금';
  if (diff < 60) return `${diff}분 전`;
  if (diff < 1440) return `${Math.floor(diff/60)}시간 전`;
  return `${Math.floor(diff/1440)}일 전`;
}

// =============================================
// 발행 모달
// =============================================
function showPublishModal() {
  const n = todayEntries.length;
  document.getElementById('modal-issue-title').textContent = `제 ${nextIssueNum}호 발행`;
  document.getElementById('modal-info').innerHTML =
    `<strong>발행 예정 호:</strong> 제 ${nextIssueNum}호<br>` +
    `<strong>발행일:</strong> ${dateStr}<br>` +
    `<strong>수록 일지:</strong> ${n}편<br><br>` +
    (n === 0
      ? '<span style="color:#bbb;">오늘 작성된 일지가 없어요.</span>'
      : '지금 발행하면 오늘의 일지가 아카이브에 저장되고<br>새로운 일지 수집이 시작됩니다.');
  document.getElementById('do-publish-btn').disabled = n === 0;
  document.getElementById('publish-modal').style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

async function doPublish() {
  if (!todayEntries.length) { closeModal('publish-modal'); return; }
  const btn = document.getElementById('do-publish-btn');
  btn.disabled = true; btn.textContent = '발행 중...';
  await publishIssue(todayKey);
  btn.textContent = '발행하기 →';
  closeModal('publish-modal');
  switchTab('archive');
}

async function publishIssue(dateKey) {
  try {
    // 1. issues 테이블에 새 호 추가
    const { data: issue } = await supabase.from('issues').insert([{
      issue_number: nextIssueNum,
      published_date: dateKey
    }]).select();

    // 2. 해당 entries를 published=true로 업데이트
    await supabase.from('entries')
      .update({ published: true, issue_id: issue[0].id })
      .eq('published', false);

    // 3. 상태 갱신
    nextIssueNum++;
    todayEntries = [];
    updateTodayCount();
    await loadData();
  } catch(e) { console.error(e); }
}

// =============================================
// 아카이브
// =============================================
async function renderArchive() {
  const g = document.getElementById('archive-grid');
  document.getElementById('archive-sub').textContent = `총 ${archives.length}호 발행됨`;
  if (!archives.length) {
    g.innerHTML = '<div class="empty-state">아직 발행된 호가 없어요.</div>';
    g.style.cssText = '';
    return;
  }
  g.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#eee;';
  g.innerHTML = archives.map((a, i) => `
    <div class="archive-item" onclick="openArchive(${i})">
      <div class="archive-issue">제 ${a.issue_number}호</div>
      <div class="archive-date">${a.published_date}</div>
      <div class="archive-count">보기 →</div>
    </div>`).join('');
}

async function openArchive(i) {
  const issue = archives[i];
  const { data: entries } = await supabase
    .from('entries')
    .select('*')
    .eq('issue_id', issue.id)
    .order('created_at', { ascending: false });

  document.getElementById('arc-modal-title').textContent = `제 ${issue.issue_number}호 — ${issue.published_date}`;
  document.getElementById('arc-modal-body').innerHTML = (entries || []).map(e => `
    <div class="feed-item" style="border-right:none;border-bottom:1px solid #eee;">
      <div class="feed-item-meta">
        <span class="feed-byline">${e.author}</span>
        <span class="feed-badge">${e.type}</span>
      </div>
      <div class="feed-text">${e.text}</div>
      <div class="feed-actions">
        <span style="font-size:10px;color:#bbb;">공감 ${e.empathy}</span>
      </div>
    </div>`).join('') || '<div class="empty-state">일지가 없어요.</div>';

  document.getElementById('archive-modal').style.display = 'flex';
}

// =============================================
// 설렘 타이머
// =============================================
function toggleTimer() {
  if (timerRunning) {
    clearInterval(timerIv); timerRunning = false;
    document.getElementById('timer-ctrl').textContent = '계속';
  } else {
    timerRunning = true;
    document.getElementById('timer-ctrl').textContent = '일시정지';
    timerIv = setInterval(() => {
      if (timerSec <= 0) { clearInterval(timerIv); timerRunning = false; document.getElementById('timer-ctrl').textContent = '완료'; return; }
      timerSec--;
      const m = Math.floor(timerSec/60), s = timerSec%60;
      document.getElementById('timer-num').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }
}

function addSparkle() {
  const inp = document.getElementById('sparkle-in');
  const v = inp.value.trim();
  if (!v) return;
  sparkleItems.push(v); inp.value = '';
  renderSparkles();
}

function removeSparkle(i) { sparkleItems.splice(i, 1); renderSparkles(); }

function renderSparkles() {
  document.getElementById('sparkle-list').innerHTML = sparkleItems.map((s, i) => `
    <div class="sparkle-item">
      <span class="sparkle-num">${String(i+1).padStart(2,'0')}</span>
      <span>${s}</span>
      <button class="sparkle-del" onclick="removeSparkle(${i})">×</button>
    </div>`).join('');
}

async function submitSparkle() {
  if (!sparkleItems.length) return;
  const text = '오늘 설레는 것들: ' + sparkleItems.join(', ');
  setSyncStatus('saving');
  const { data } = await supabase.from('entries').insert([{
    author: anonOn ? '익명' : '나',
    text, type: '설렘일지', empathy: 0, published: false
  }]).select();
  todayEntries.unshift(data[0]);
  sparkleItems = []; renderSparkles();
  clearInterval(timerIv); timerRunning = false; timerSec = 300;
  document.getElementById('timer-num').textContent = '5:00';
  document.getElementById('timer-ctrl').textContent = '시작';
  updateTodayCount();
  setSyncStatus('ok');
  switchTab('feed');
}

// =============================================
// 시작
// =============================================
loadData();
