import { getCampaign, listCampaigns, recordCampaignMessage, recordCampaignResult, updateCampaign } from './campaign.store.js';
import { sendButtons, sendList, sendMedia, sendText } from './evolution.service.js';
import { shouldAutoPause } from './campaign.safety.js';

const queue = [];
const controls = new Map();
let running = false;

function normalizeNumber(value) { return String(value ?? '').trim().replace(/[^0-9]/g, ''); }
function personalize(template, recipient) {
  return String(template ?? '').replace(/\{\{\s*(name|company|custom1|custom2)\s*\}\}/gi, (_, key) => {
    const value = recipient?.[key.toLowerCase()];
    return value == null ? '' : String(value);
  });
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function messageIdFrom(response) { return response?.key?.id || response?.data?.key?.id || response?.message?.key?.id || response?.data?.message?.key?.id; }

export function enqueueCampaign(id) {
  if (!queue.includes(id)) queue.push(id);
  void drain();
}

export function getQueueSize() { return queue.length + (running ? 1 : 0); }
export function pauseCampaign(id) { controls.set(id, 'paused'); }
export function resumeCampaign(id) { controls.set(id, 'resumed'); enqueueCampaign(id); }
export function cancelCampaign(id) { controls.set(id, 'cancelled'); }

async function processCampaign(id) {
  let campaign = await getCampaign(id);
  if (!campaign || !['queued', 'paused'].includes(campaign.status)) return;
  if (campaign.status === 'paused' && controls.get(id) !== 'resumed') return;
  controls.delete(id);
  campaign = await updateCampaign(id, { status: 'running', startedAt: new Date().toISOString() });
  let results = campaign.results || [];

  for (let index = campaign.results?.length || 0; index < campaign.recipients.length; index += 1) {
    const control = controls.get(id);
    if (control === 'cancelled') {
      controls.delete(id);
      await updateCampaign(id, { status: 'cancelled' });
      return;
    }
    if (control === 'paused') {
      await updateCampaign(id, { status: 'paused' });
      return;
    }
    const recipient = campaign.recipients[index] || {};
    const number = normalizeNumber(recipient.phone || recipient.number);
    let result;
    const sentMessageIds = [];
    const track = async (response, messageType) => { const messageId = messageIdFrom(response); if (messageId) { sentMessageIds.push(messageId); await recordCampaignMessage(id, index, messageId, messageType, 'PENDING'); } };
    if (!number || number.length < 8 || number.length > 15) {
      result = { index, phone: recipient.phone || recipient.number || '', ok: false, message: 'Invalid phone number.' };
    } else {
      try {
        const payload = campaign.payload || {};
        if (campaign.type === 'text') {
          const response = await sendText(campaign.instance, number, personalize(payload.text, recipient), { delayMs: 0 });
          await track(response, 'text');
        } else if (['media', 'media-text', 'media-buttons', 'media-list'].includes(campaign.type)) {
          const response = await sendMedia(campaign.instance, number, payload.media, { caption: personalize(payload.caption || '', recipient), delayMs: 0 });
          await track(response, 'media');
          if (campaign.type === 'media-buttons') {
            const response = await sendButtons(campaign.instance, number, { title: personalize(payload.title, recipient), description: personalize(payload.description, recipient), footer: personalize(payload.footer, recipient), buttons: (payload.buttons || []).map((button) => ({ ...button, id: personalize(button.id, recipient), displayText: personalize(button.displayText, recipient) })) });
            await track(response, 'buttons');
          } else if (campaign.type === 'media-list') {
            const response = await sendList(campaign.instance, number, { title: personalize(payload.title, recipient), description: personalize(payload.description, recipient), footerText: personalize(payload.footerText, recipient), buttonText: personalize(payload.buttonText, recipient), sections: (payload.sections || []).map((section) => ({ title: personalize(section.title, recipient), rows: (section.rows || []).map((row) => ({ rowId: personalize(row.rowId, recipient), title: personalize(row.title, recipient), description: personalize(row.description, recipient) })) })) });
            await track(response, 'list');
          }
        } else if (campaign.type === 'buttons') {
          const response = await sendButtons(campaign.instance, number, {
            title: personalize(payload.title, recipient),
            description: personalize(payload.description, recipient),
            footer: personalize(payload.footer, recipient),
            buttons: (payload.buttons || []).map((button) => ({
              ...button,
              id: personalize(button.id, recipient),
              displayText: personalize(button.displayText, recipient),
              url: button.url ? personalize(button.url, recipient) : undefined,
              copyCode: button.copyCode ? personalize(button.copyCode, recipient) : undefined,
              phoneNumber: button.phoneNumber ? personalize(button.phoneNumber, recipient) : undefined,
            })),
          });
          await track(response, 'buttons');
        } else if (campaign.type === 'list') {
          const response = await sendList(campaign.instance, number, {
            title: personalize(payload.title, recipient),
            description: personalize(payload.description, recipient),
            footerText: personalize(payload.footerText, recipient),
            buttonText: personalize(payload.buttonText, recipient),
            sections: (payload.sections || []).map((section) => ({
              title: personalize(section.title, recipient),
              rows: (section.rows || []).map((row) => ({
                rowId: personalize(row.rowId, recipient),
                title: personalize(row.title, recipient),
                description: personalize(row.description, recipient),
              })),
            })),
          });
          await track(response, 'list');
        } else throw new Error('Unsupported campaign type.');
        result = { index, phone: number, ok: true };
      } catch (error) {
        result = { index, phone: number, ok: false, message: error?.message || 'Send failed.' };
      }
    }
    results = [...results, { ...result, timestamp: new Date().toISOString() }];
    const sent = results.filter((item) => item.ok).length;
    await recordCampaignResult(id, results[results.length - 1], { sent, failed: results.length - sent });
    if (shouldAutoPause(results)) {
      await updateCampaign(id, {
        status: 'paused',
        error: 'Campaign paused automatically because the failure rate exceeded the safety threshold.',
      });
      controls.delete(id);
      return;
    }
    if (index < campaign.recipients.length - 1) await sleep(campaign.delayMs);
  }

  const sent = results.filter((item) => item.ok).length;
  await updateCampaign(id, {
    status: 'completed',
    sent,
    failed: results.length - sent,
    completedAt: new Date().toISOString(),
  });
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const id = queue.shift();
      try { await processCampaign(id); } catch (error) {
        await updateCampaign(id, { status: 'failed', error: error?.message || 'Campaign worker failed.' });
      }
    }
  } finally { running = false; }
}

export async function recoverCampaigns() {
  const campaigns = await listCampaigns({ limit: 200 });
  for (const campaign of campaigns) {
    if (campaign.status === 'running') await updateCampaign(campaign.id, { status: 'queued', startedAt: null });
    if (campaign.status === 'queued' || campaign.status === 'running') enqueueCampaign(campaign.id);
  }
}
