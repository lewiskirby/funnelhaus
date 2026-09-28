// Receives applications from funnelhaus.co/careers/<slug> and saves them to
// the 🙋 Applicants database in Notion, linked to the job post (CV attached).

const { findLiveJob, uploadFile, createApplicant } = require('./_notion');

const LIMITS = { name: 100, email: 320, phone: 40, link: 500, loom: 500, availability: 3, message: 5000 };
const REQUIRED = ['name', 'email', 'phone', 'loom', 'availability'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CV_MAX_BYTES = 4 * 1024 * 1024; // Vercel accepts up to 4.5MB per request
const CV_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Reads the raw request and parses it as a form (multipart or URL-encoded). */
async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4.5 * 1024 * 1024) throw new Error('too large');
    chunks.push(chunk);
  }
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] || '' },
    body: Buffer.concat(chunks),
  }).formData();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // fetch() calls get JSON; plain form posts (no JS) are sent back to the page.
  const wantsJson = (req.headers.accept || '').includes('application/json');
  const fail = (status, message) => (wantsJson ? res.status(status).json({ error: message }) : res.status(status).send(message));

  let form;
  try {
    form = await readForm(req);
  } catch {
    return fail(400, "We couldn't read your application. If you attached a CV, please try a smaller file.");
  }

  const field = (key) => {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };
  const slug = field('slug').toLowerCase();
  const done = () => (wantsJson ? res.status(200).json({ ok: true }) : res.redirect(303, `/careers/${slug}?applied=1#apply`));

  // Honeypot: real people never fill this hidden field. Pretend it worked.
  if (field('company_website')) return done();

  const data = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    data[key] = field(key);
    if (data[key].length > max) return fail(400, 'One of your answers is too long. Please shorten it and try again.');
  }
  for (const key of REQUIRED) {
    if (!data[key]) return fail(400, 'Please fill in your name, email, phone, Loom video and availability.');
  }
  data.email = data.email.toLowerCase();
  if (!EMAIL_RE.test(data.email)) return fail(400, 'Please enter a valid email address.');
  if (!['Yes', 'No'].includes(data.availability)) return fail(400, 'Please say whether the availability requirements suit you.');
  const toUrl = (value) => {
    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      return new URL(url).href;
    } catch {
      return '';
    }
  };
  data.loom = toUrl(data.loom);
  if (!data.loom) return fail(400, 'Please check your Loom video link.');
  if (data.link) {
    if (!/^https?:\/\//i.test(data.link)) data.link = `https://${data.link}`;
    try {
      new URL(data.link);
    } catch {
      return fail(400, 'Please check your LinkedIn or portfolio link.');
    }
  }

  const cv = form.get('cv');
  const hasCv = cv && typeof cv === 'object' && cv.size > 0;
  if (hasCv) {
    if (!CV_TYPES.includes(cv.type)) return fail(400, 'Please upload your CV as a PDF or Word document.');
    if (cv.size > CV_MAX_BYTES) return fail(400, 'Your CV is over 4MB. Please upload a smaller file.');
  }

  try {
    const job = await findLiveJob(slug);
    if (!job) return fail(400, "This role isn't taking applications any more.");
    const cvName = hasCv ? (cv.name || 'CV').slice(0, 100) : undefined;
    const cvUploadId = hasCv ? await uploadFile(Buffer.from(await cv.arrayBuffer()), cvName, cv.type) : undefined;
    await createApplicant(job, { ...data, cvUploadId, cvName });
  } catch (err) {
    console.error('Application failed', err);
    return fail(502, "We couldn't send your application. Please try again, or email info@funnelhaus.co.");
  }

  return done();
};
