// Renders funnelhaus.co/careers/<slug> from the 💼 Job Posts database in Notion.
// Only posts with Status = Live are shown; everything else is a 404.
// Pages are cached for a minute, so changes in Notion appear within about 60s.

const { findLiveJob, pageContent } = require('./_notion');

// ─── Helpers ────────────────────────────────────────

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SAFE_URL = /^(https?:|mailto:|tel:)/i;
const safeUrl = (url) => (url && SAFE_URL.test(url) ? url : '');

function richText(parts = []) {
  return parts
    .map((t) => {
      let html = esc(t.plain_text).replace(/\n/g, '<br>');
      const a = t.annotations || {};
      if (a.code) html = `<code>${html}</code>`;
      if (a.bold) html = `<strong>${html}</strong>`;
      if (a.italic) html = `<em>${html}</em>`;
      if (a.strikethrough) html = `<s>${html}</s>`;
      if (a.underline) html = `<u>${html}</u>`;
      const href = safeUrl(t.href);
      if (href) html = `<a href="${esc(href)}" target="_blank" rel="noopener">${html}</a>`;
      return html;
    })
    .join('');
}

/** An embeddable player for Loom (with views, title, owner and share hidden), YouTube or Vimeo. */
function embedUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'loom.com') {
      const id = (u.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/) || [])[1];
      return id ? `https://www.loom.com/embed/${id}?hideEmbedTopBar=true&hide_owner=true&hide_share=true&hide_title=true&hide_speed=true` : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v') || (u.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/) || [])[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === 'vimeo.com') {
      const id = (u.pathname.match(/\/(\d+)/) || [])[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {}
  return null;
}

const videoFrame = (src, title) =>
  `<div class="video"><iframe src="${esc(src)}" title="${esc(title)}" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;

// ─── Notion blocks → HTML ───────────────────────────

function renderBlocks(blocks = []) {
  let html = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    // Consecutive list items share one list.
    if (b.type === 'bulleted_list_item' || b.type === 'numbered_list_item') {
      const tag = b.type === 'bulleted_list_item' ? 'ul' : 'ol';
      let items = '';
      while (i < blocks.length && blocks[i].type === b.type) {
        const item = blocks[i];
        items += `<li>${richText(item[item.type].rich_text)}${renderBlocks(item._children)}</li>`;
        i++;
      }
      i--;
      html += `<${tag}>${items}</${tag}>`;
      continue;
    }
    html += renderBlock(b);
  }
  return html;
}

function renderBlock(b) {
  const d = b[b.type] || {};
  const kids = renderBlocks(b._children);
  switch (b.type) {
    case 'paragraph': {
      const text = richText(d.rich_text);
      return (text ? `<p>${text}</p>` : '') + kids;
    }
    case 'heading_1':
    case 'heading_2':
      return `<h2>${richText(d.rich_text)}</h2>${kids}`;
    case 'heading_3':
      return `<h3>${richText(d.rich_text)}</h3>${kids}`;
    case 'quote':
      return `<blockquote>${richText(d.rich_text)}${kids}</blockquote>`;
    case 'callout': {
      const icon = d.icon && d.icon.type === 'emoji' ? `<span class="callout-icon">${esc(d.icon.emoji)}</span>` : '';
      return `<div class="callout">${icon}<div>${richText(d.rich_text)}${kids}</div></div>`;
    }
    case 'to_do':
      return `<p class="todo"><span>${d.checked ? '☑' : '☐'}</span> ${richText(d.rich_text)}</p>${kids}`;
    case 'toggle':
      return `<details><summary>${richText(d.rich_text)}</summary>${kids}</details>`;
    case 'divider':
      return '<hr>';
    case 'image': {
      const src = safeUrl(d.type === 'external' ? d.external && d.external.url : d.file && d.file.url);
      if (!src) return '';
      const caption = richText(d.caption);
      return `<figure><img src="${esc(src)}" alt="${esc((d.caption || []).map((t) => t.plain_text).join(''))}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    case 'video':
    case 'embed':
    case 'bookmark':
    case 'link_preview': {
      const url = safeUrl(d.url || (d.external && d.external.url) || (d.file && d.file.url));
      if (!url) return '';
      const embed = embedUrl(url);
      if (embed) return videoFrame(embed, 'Video');
      if (b.type === 'video') return `<figure><video src="${esc(url)}" controls playsinline></video></figure>`;
      return `<p><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>`;
    }
    default:
      // Columns, synced blocks and the like: show what's inside.
      return kids;
  }
}

// ─── Page ───────────────────────────────────────────

const LOGO = `<svg viewBox="0 0 214.17 287.44" aria-hidden="true"><path fill="#700000" d="M8.17,160.29v-69.51L107.08,9.09l98.92,81.7v69.51H8.17ZM32.17,102.09v34.19h149.83v-34.19l-74.92-61.87-74.92,61.87Z"/><path fill="#700000" d="M13.77,183.72h186.64l-93.32,94.13L13.77,183.72ZM107.09,243.76l35.73-36.04h-71.45l35.73,36.04Z"/></svg>`;

const STYLES = `
:root{--red:#700000;--red-dark:#580000;--red-faint:rgba(112,0,0,.07);--dark:#111;--text:#242424;--muted:#6a6a6a;--light:#b0b0b0;--border:rgba(0,0,0,.08);--cream:#fffefa;--white:#fff;--off-white:#f4f2ec;--green:#1f7a4d;--green-soft:#e8f3ec}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'Inter',system-ui,sans-serif;background:var(--cream);color:var(--text);line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:inherit}
img,video{max-width:100%;display:block}
.wrap{width:100%;max-width:820px;margin:0 auto;padding:0 20px}
nav{position:sticky;top:0;z-index:10;background:rgba(255,254,250,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--border)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;height:64px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:-.02em;color:var(--dark)}
.logo svg{height:24px;width:auto}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-weight:600;font-size:15px;border:0;border-radius:12px;padding:14px 26px;cursor:pointer;text-decoration:none;transition:background .18s,transform .18s}
.btn-primary{background:var(--red);color:#fff}
.btn-primary:hover{background:var(--red-dark)}
.btn-primary:disabled{opacity:.6;cursor:wait}
header.hero{padding:64px 0 36px;text-align:center}
h1{font-size:clamp(30px,5vw,50px);font-weight:700;letter-spacing:-.03em;line-height:1.1;color:var(--dark);max-width:760px;margin:0 auto;overflow-wrap:break-word}
.details{margin-top:22px;display:flex;flex-direction:column;gap:4px;font-size:16px;color:var(--muted)}
.details strong{font-weight:600;color:var(--dark)}
.hero .btn{margin-top:28px}
.video{position:relative;aspect-ratio:16/9;border-radius:20px;overflow:hidden;background:var(--dark);box-shadow:0 24px 60px -20px rgba(0,0,0,.35)}
.video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.hero-video{margin-bottom:48px}
.card{background:var(--white);border:1px solid var(--border);border-radius:28px;box-shadow:0 20px 60px rgba(0,0,0,.05);padding:48px 52px}
.content{font-size:16.5px}
.content>*+*{margin-top:16px}
.content h2{font-size:24px;font-weight:700;letter-spacing:-.02em;line-height:1.25;color:var(--dark);margin-top:40px}
.content h3{font-size:19px;font-weight:600;letter-spacing:-.01em;color:var(--dark);margin-top:28px}
.content h2+hr,.content h3+hr{margin-top:12px}
.content>:first-child{margin-top:0}
.content strong{font-weight:600;color:var(--dark)}
.content a{color:var(--red);text-decoration:underline;text-decoration-color:rgba(112,0,0,.3);text-underline-offset:3px}
.content ul,.content ol{padding-left:22px}
.content li+li{margin-top:6px}
.content li::marker{color:var(--red)}
.content hr{border:0;border-top:1px solid var(--border)}
.content blockquote{border-left:3px solid var(--red);padding-left:18px;color:var(--muted)}
.content figure img{border-radius:16px;border:1px solid var(--border)}
.content figcaption{font-size:13.5px;color:var(--muted);margin-top:8px}
.content code{font-size:.9em;background:var(--off-white);border-radius:6px;padding:2px 6px}
.content details summary{cursor:pointer;font-weight:600;color:var(--dark)}
.content details>*+*{margin-top:10px}
.callout{display:flex;gap:12px;background:var(--off-white);border-radius:16px;padding:16px 18px}
.callout-icon{font-size:20px;line-height:1.4}
.cta{margin-top:30px}
.cta-end{text-align:center;margin-top:40px}
.modal{position:fixed;inset:0;z-index:50;display:none;align-items:flex-start;justify-content:center;padding:40px 16px;background:rgba(17,17,17,.55);overflow-y:auto;-webkit-overflow-scrolling:touch}
.modal:target,.modal.open{display:flex}
.modal-box{position:relative;width:100%;max-width:640px;margin:auto 0;background:var(--white);border-radius:24px;box-shadow:0 30px 80px rgba(0,0,0,.25);padding:40px 44px}
.modal-box h2{font-size:clamp(22px,3vw,28px);font-weight:700;letter-spacing:-.025em;line-height:1.2;color:var(--dark);padding-right:36px}
.modal-box .sub{color:var(--muted);margin:6px 0 28px}
.close{position:absolute;top:18px;right:18px;display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;color:var(--muted);text-decoration:none;font-size:24px;line-height:1}
.close:hover{background:var(--off-white);color:var(--dark)}
body.modal-open{overflow:hidden}
.choices{display:flex;gap:10px}
.choices label{flex:1;display:flex;align-items:center;gap:10px;font-weight:500;margin:0;background:var(--cream);border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:12px 14px;cursor:pointer}
.choices label:has(input:checked){border-color:var(--red);box-shadow:0 0 0 4px var(--red-faint)}
.choices input{accent-color:var(--red)}
.hint{font-size:13.5px;font-weight:400;color:var(--muted);margin:-4px 0 10px;line-height:1.5}
.row{display:grid;grid-template-columns:1fr 1fr;gap:22px 18px}
.field+.field,.row+.field,.field+.row{margin-top:22px}
.row .field+.field{margin-top:0}
label{display:block;font-size:15px;font-weight:600;color:var(--dark);letter-spacing:-.01em;margin-bottom:8px}
label .opt{font-weight:400;color:var(--light)}
input[type=text],input[type=email],input[type=tel],input[type=url],textarea{width:100%;font:inherit;font-size:16px;color:var(--text);background:var(--cream);border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:12px 14px;transition:border-color .18s,box-shadow .18s}
input:focus,textarea:focus{outline:0;border-color:var(--red);box-shadow:0 0 0 4px var(--red-faint)}
textarea{min-height:130px;resize:vertical;line-height:1.55}
input[type=file]{font:inherit;font-size:14px;color:var(--muted);width:100%}
input[type=file]::file-selector-button{font:inherit;font-weight:600;font-size:14px;color:var(--dark);background:var(--off-white);border:1px solid var(--border);border-radius:10px;padding:9px 16px;margin-right:12px;cursor:pointer}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.actions{margin-top:30px}
.error{color:var(--red);font-weight:500;font-size:14.5px;margin-top:16px}
.success{display:flex;gap:14px;align-items:flex-start;background:var(--green-soft);color:var(--green);border-radius:18px;padding:22px}
.success strong{display:block;font-size:17px}
.tick{flex:none;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--green);color:#fff;font-weight:700}
footer{padding:48px 0 56px;text-align:center;font-size:13.5px;color:var(--light)}
footer a{color:var(--muted);text-decoration:none;font-weight:500}
@media (max-width:640px){header.hero{padding:44px 0 28px}.card{padding:28px 22px;border-radius:22px}.row{grid-template-columns:1fr}.btn-lg{width:100%}.modal{padding:0}.modal-box{border-radius:0;min-height:100%;padding:28px 20px 36px}.choices{flex-direction:column}}
`;

// Opens the application pop-up, and sends the form with fetch so the page
// doesn't reload. Without JS the pop-up still opens (via #apply) and posts normally.
const SCRIPT = `
(function(){
  var modal=document.getElementById('apply');if(!modal)return;
  var form=document.getElementById('apply-form');
  function open(e){if(e)e.preventDefault();modal.classList.add('open');document.body.classList.add('modal-open');var f=modal.querySelector('input:not([type=hidden]):not([tabindex="-1"])');if(f)setTimeout(function(){f.focus()},30);}
  function close(e){if(e)e.preventDefault();modal.classList.remove('open');document.body.classList.remove('modal-open');if(location.hash==='#apply')history.replaceState(null,'',location.pathname+location.search);}
  document.querySelectorAll('a[href="#apply"]').forEach(function(a){a.addEventListener('click',open);});
  modal.querySelector('.close').addEventListener('click',close);
  modal.addEventListener('click',function(e){if(e.target===modal)close();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modal.classList.contains('open'))close();});
  if(location.hash==='#apply')open();
  if(!form)return;
  var err=form.querySelector('.error'),btn=form.querySelector('button[type=submit]');
  form.addEventListener('submit',function(e){
    e.preventDefault();err.hidden=true;
    if(!form.checkValidity()){form.reportValidity();return;}
    var cv=form.cv.files[0];
    if(cv&&cv.size>4*1024*1024){err.textContent='Your CV is over 4MB. Please upload a smaller file.';err.hidden=false;return;}
    btn.disabled=true;btn.textContent='Sending…';
    fetch(form.action,{method:'POST',body:new FormData(form),headers:{Accept:'application/json'}})
      .then(function(r){return r.json().catch(function(){return{}}).then(function(b){if(!r.ok)throw new Error(b.error||'');})})
      .then(function(){document.getElementById('apply-body').innerHTML=document.getElementById('sent').innerHTML;})
      .catch(function(x){err.textContent=x.message||"We couldn't send your application. Please try again.";err.hidden=false;btn.disabled=false;btn.textContent='Send application';});
  });
})();`;

const SUCCESS = `<div class="success" role="status"><span class="tick">✓</span><div><strong>Application sent</strong>Thanks for applying. We'll be in touch by email.</div></div>`;

function page({ title, description, canonical, body, status = 200 }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}"><meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:title" content="${esc(title)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ''}
${status === 200 ? '' : '<meta name="robots" content="noindex">'}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function nav() {
  return `<nav><div class="wrap nav-inner"><a class="logo" href="/">${LOGO}FunnelHaus</a></div></nav>`;
}

function jobPage(job, blocks, applied) {
  const video = job.loomUrl ? embedUrl(job.loomUrl) : null;
  const firstText = blocks.find((b) => b.type === 'paragraph' && (b.paragraph.rich_text || []).length);
  const description = firstText ? firstText.paragraph.rich_text.map((t) => t.plain_text).join('').trim().slice(0, 160) : '';
  const form = `
    <form id="apply-form" action="/api/apply" method="POST" enctype="multipart/form-data">
      <input type="hidden" name="slug" value="${esc(job.slug)}">
      <div class="hp" aria-hidden="true"><label>Company website <input type="text" name="company_website" tabindex="-1" autocomplete="off"></label></div>
      <div class="field"><label for="name">Name</label><input type="text" id="name" name="name" required maxlength="100" autocomplete="name"></div>
      <div class="row" style="margin-top:22px">
        <div class="field"><label for="email">Email</label><input type="email" id="email" name="email" required maxlength="320" autocomplete="email"></div>
        <div class="field"><label for="phone">Phone</label><input type="tel" id="phone" name="phone" required maxlength="40" autocomplete="tel"></div>
      </div>
      <div class="field"><label for="cv">CV <span class="opt">(optional, PDF or Word, up to 4MB)</span></label><input type="file" id="cv" name="cv" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></div>
      <div class="field"><label for="link">LinkedIn, portfolio or website <span class="opt">(optional)</span></label><input type="text" id="link" name="link" maxlength="500" inputmode="url" placeholder="linkedin.com/in/…"></div>
      <div class="field"><label for="loom">Your Loom video</label><p class="hint">Please attach a short (2 to 5 minute) Loom video introducing yourself, discussing your experience, and sharing why you would be a good fit for this role in particular.</p><input type="url" id="loom" name="loom" required maxlength="500" placeholder="https://www.loom.com/share/…"></div>
      <fieldset class="field" style="border:0"><legend style="display:block;font-size:15px;font-weight:600;color:var(--dark);margin-bottom:8px">Do the availability requirements shared suit you?</legend>
        <div class="choices"><label><input type="radio" name="availability" value="Yes" required> Yes</label><label><input type="radio" name="availability" value="No"> No</label></div>
      </fieldset>
      <div class="field"><label for="message">Anything else you want to share to support your application? <span class="opt">(optional)</span></label><textarea id="message" name="message" maxlength="5000"></textarea></div>
      <p class="error" role="alert" hidden></p>
      <div class="actions"><button type="submit" class="btn btn-primary btn-lg">Send application</button></div>
    </form>`;

  return page({
    title: job.title,
    description,
    canonical: `https://funnelhaus.co/careers/${job.slug}`,
    body: `${nav()}
<main class="wrap">
  <header class="hero">
    <h1>${esc(job.title)}</h1>
    ${job.details.length ? `<div class="details">${job.details.map(([label, value]) => `<p><strong>${esc(label)}:</strong> ${esc(value)}</p>`).join('')}</div>` : ''}
    <div class="cta"><a class="btn btn-primary btn-lg" href="#apply">Apply now</a></div>
  </header>
  ${video ? `<div class="hero-video">${videoFrame(video, job.title)}</div>` : ''}
  ${blocks.length ? `<article class="card content">${renderBlocks(blocks)}</article>` : ''}
  <div class="cta-end"><a class="btn btn-primary btn-lg" href="#apply">Apply now</a></div>
</main>
<div id="apply" class="modal${applied ? ' open' : ''}" role="dialog" aria-modal="true" aria-labelledby="apply-title">
  <div class="modal-box">
    <a class="close" href="#" aria-label="Close">×</a>
    <h2 id="apply-title">Apply for this role</h2>
    <p class="sub">${esc(job.title)}</p>
    <div id="apply-body">${applied ? SUCCESS : form}</div>
    <template id="sent">${SUCCESS}</template>
  </div>
</div>
<footer><a href="/">FunnelHaus</a></footer>
<script>${SCRIPT}</script>`,
  });
}

function notFoundPage() {
  return page({
    title: 'Page not found · FunnelHaus',
    status: 404,
    body: `${nav()}
<main class="wrap"><header class="hero"><h1>This role isn't open right now</h1><p style="color:var(--muted);margin-top:14px">The link may be old, or the role may have been filled.</p></header></main>`,
  });
}

// ─── Handler ────────────────────────────────────────

module.exports = async (req, res) => {
  const slug = String((req.query && req.query.slug) || '').toLowerCase();
  const applied = req.query && req.query.applied === '1';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  let job = null;
  let blocks = [];
  try {
    job = await findLiveJob(slug);
    if (job) blocks = await pageContent(job.id);
  } catch (err) {
    console.error('Careers page failed', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send(page({ title: 'FunnelHaus', status: 500, body: `${nav()}<main class="wrap"><header class="hero"><h1>Something went wrong</h1><p style="color:var(--muted);margin-top:14px">Please refresh the page in a moment.</p></header></main>` }));
  }

  if (!job) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(404).send(notFoundPage());
  }

  // Cached at Vercel's edge for a minute. Notion's image links last an hour, so this stays well inside that.
  res.setHeader('Cache-Control', applied ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).send(jobPage(job, blocks, applied));
};
