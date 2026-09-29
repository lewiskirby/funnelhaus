// Shared Notion helpers for the careers pages. Files starting with "_" are not
// deployed as their own endpoints. NOTION_TOKEN lives in Vercel's env vars.

const API = 'https://api.notion.com/v1';
const VERSION = '2025-09-03';

// 💼 Job Posts and 🙋 Applicants in FunnelHaus HQ.
const JOBS_DS = process.env.NOTION_JOBS_DS || '2b68ffcc-8d56-49b3-84cb-5bb03f1b3120';
const APPLICANTS_DS = process.env.NOTION_APPLICANTS_DS || '3ff0e0e9-ac53-47c2-8748-723c8e3e6bfa';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function notion(path, { method = 'GET', body } = {}) {
  if (!process.env.NOTION_TOKEN) throw new Error('NOTION_TOKEN is not set');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion ${method} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const plain = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((t) => t.plain_text).join('').trim();
const selected = (prop) => (prop && prop.select && prop.select.name) || '';
const multi = (prop) => ((prop && prop.multi_select) || []).map((o) => o.name).join(', ');

/** The Live job post with this slug, or null. Anything not Live stays hidden. */
async function findLiveJob(slug) {
  if (!SLUG_RE.test(slug) || slug.length > 100) return null;
  const res = await notion(`/data_sources/${JOBS_DS}/query`, {
    method: 'POST',
    body: {
      filter: {
        and: [
          { property: 'Slug', rich_text: { equals: slug } },
          { property: 'Status', select: { equals: 'Live' } },
        ],
      },
      page_size: 1,
    },
  });
  const page = res.results.find((p) => !p.in_trash && plain(p.properties.Slug) === slug);
  if (!page) return null;
  const p = page.properties;
  return {
    id: page.id,
    slug,
    // "Title for landing page" is the public headline; Title is the fallback.
    title: plain(p['Title for landing page']) || plain(p.Title) || 'Join the team',
    loomUrl: (p['Loom URL'] && p['Loom URL'].url) || '',
    // Copied onto each applicant so they're filed under the right client.
    clientIds: ((p.Client && p.Client.relation) || []).map((r) => ({ id: r.id })),
    // Copied onto each applicant so they can be filtered by role.
    role: selected(p.Role),
    // Shown under the headline, only when filled in.
    details: [
      ['OTE', plain(p.OTE)],
      ['Type', selected(p.Type)],
      ['Time zone', multi(p['Time Zone'])],
    ].filter(([, value]) => value),
  };
}

/** A block's children, following Notion's pagination. */
async function children(blockId) {
  const out = [];
  let cursor;
  do {
    const res = await notion(`/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** The page body with nested blocks attached as `_children` (three levels deep). */
async function pageContent(pageId, depth = 0) {
  const blocks = await children(pageId);
  if (depth < 3) {
    await Promise.all(
      blocks.map(async (b) => {
        if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') b._children = await pageContent(b.id, depth + 1);
      }),
    );
  }
  return blocks;
}

/** Uploads a file to Notion and returns its id, to attach to a page within the hour. */
async function uploadFile(buffer, filename, contentType) {
  const created = await notion('/file_uploads', { method: 'POST', body: { filename, content_type: contentType } });
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType }), filename);
  const res = await fetch(`${API}/file_uploads/${created.id}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': VERSION },
    body: form,
  });
  if (!res.ok) throw new Error(`Notion file upload failed: ${res.status} ${await res.text()}`);
  return created.id;
}

/** Notion allows 2,000 characters per piece of text, so long answers are split. */
const textChunks = (value) => {
  const out = [];
  for (let i = 0; i < value.length; i += 2000) out.push({ type: 'text', text: { content: value.slice(i, i + 2000) } });
  return out;
};

// Applicants property names, exactly as they are in Notion.
const FIELDS = {
  link: 'LinkedIn, Portfolio or Website',
  loom: 'Please attach a short (2- to 5-minute) Loom video introducing yourself, discussing your experience, and sharing why you would be a good fit for this role in particular',
  availability: 'Do the availability requirements shared suit you?',
  message: 'Anything else you want to share to support your application?',
};

/** Creates the applicant with Status New, linked to the job post and its client. "Applied" is set by Notion. */
async function createApplicant(job, { name, email, phone, link, loom, availability, message, cvUploadId, cvName }) {
  await notion('/pages', {
    method: 'POST',
    body: {
      parent: { type: 'data_source_id', data_source_id: APPLICANTS_DS },
      properties: {
        Name: { title: [{ type: 'text', text: { content: name } }] },
        Email: { email },
        Phone: { phone_number: phone },
        [FIELDS.link]: { url: link || null },
        [FIELDS.loom]: { url: loom },
        [FIELDS.availability]: { select: { name: availability } },
        [FIELDS.message]: { rich_text: textChunks(message) },
        Status: { select: { name: 'New' } },
        'Job Post': { relation: [{ id: job.id }] },
        Client: { relation: job.clientIds },
        // Notion adds the option if a job post uses a role Applicants doesn't have yet.
        ...(job.role ? { Role: { select: { name: job.role } } } : {}),
        ...(cvUploadId ? { CV: { files: [{ type: 'file_upload', file_upload: { id: cvUploadId }, name: cvName }] } } : {}),
      },
    },
  });
}

module.exports = { SLUG_RE, findLiveJob, pageContent, uploadFile, createApplicant };
