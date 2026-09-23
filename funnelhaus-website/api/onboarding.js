// Receives the /welcome onboarding form and forwards it to the Make.com webhook.
// The webhook URL lives in the MAKE_ONBOARDING_WEBHOOK_URL env var so it is never exposed to the browser.

const NEXT_PAGE = '/welcome/next/';

// Form field name → max length. Keys are what Make receives.
const FIELDS = {
  business_name: 200,
  name: 200,
  email: 320,
  google_email: 320,
  primary_language: 50,
  social_links: 2000,
  funnel_urls: 2000,
  paid_media: 10,
  paid_media_budget: 500,
  asset_folders: 2000,
  colours: 1000,
  fonts: 1000,
  other_google_accounts: 2000,
  team_contacts: 2000,
  offers: 2000,
  target_customer: 2000,
  worked: 2000,
  not_worked: 2000,
  starting_point: 2000,
  goals: 2000,
};

const REQUIRED = ['business_name', 'name', 'email', 'google_email'];
const EMAILS = ['email', 'google_email'];
const LANGUAGES = ['🇬🇧 English', '🇩🇪 German', '🇪🇸 Spanish'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Plain HTML form posts (no JS) get redirected; fetch() calls get JSON.
  const wantsJson = (req.headers.accept || '').includes('application/json');
  const fail = (status, message) =>
    wantsJson
      ? res.status(status).json({ error: message })
      : res.status(status).send(message);

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: real people never fill this hidden field. Pretend success for bots.
  if (body.company_website) {
    return wantsJson ? res.status(200).json({ redirect: NEXT_PAGE }) : res.redirect(303, NEXT_PAGE);
  }

  const data = {};
  for (const [key, max] of Object.entries(FIELDS)) {
    const value = typeof body[key] === 'string' ? body[key].trim() : '';
    if (value.length > max) return fail(400, 'One of your answers is too long. Please shorten it and try again.');
    data[key] = value;
  }

  for (const key of REQUIRED) {
    if (!data[key]) return fail(400, 'Please fill in all required fields.');
  }
  for (const key of EMAILS) {
    if (data[key] && !EMAIL_RE.test(data[key])) return fail(400, 'Please enter a valid email address.');
  }
  if (data.primary_language && !LANGUAGES.includes(data.primary_language)) data.primary_language = '';
  if (data.paid_media && !['Yes', 'No'].includes(data.paid_media)) data.paid_media = '';

  const webhookUrl = process.env.MAKE_ONBOARDING_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('MAKE_ONBOARDING_WEBHOOK_URL is not set');
    return fail(500, "We couldn't submit your form. Please try again, or email info@funnelhaus.co.");
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        submitted_at: new Date().toISOString(),
        source: 'funnelhaus.co/welcome',
      }),
    });
    if (!response.ok) throw new Error(`Make webhook responded ${response.status}: ${await response.text()}`);
  } catch (err) {
    console.error('Onboarding webhook failed', err);
    return fail(502, "We couldn't submit your form. Please try again, or email info@funnelhaus.co.");
  }

  return wantsJson ? res.status(200).json({ redirect: NEXT_PAGE }) : res.redirect(303, NEXT_PAGE);
};
