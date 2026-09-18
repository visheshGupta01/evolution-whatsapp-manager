import { useEffect, useState } from 'react';
import * as XLSX from '@keep-lts/xlsx';
import { BarChart3, Clock3, FileText, Loader2, MessageSquare, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { campaignJobsApi, type CampaignAnalytics, type CampaignJob } from '../lib/api';
import '../styles/campaigns.css';

const labels: Record<CampaignJob['type'], string> = {
  text: 'Text',
  'media-text': 'Media + Text',
  media: 'Media',
  buttons: 'Buttons',
  list: 'List',
  'media-buttons': 'Media + Buttons',
  'media-list': 'Media + List',
};

function exportResults(campaign: CampaignJob) {
  const rows = (campaign.results || []).map((item) => ({ index: item.index + 1, phone: item.phone, status: item.ok ? 'Sent' : 'Failed', error: item.message || '' }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Results');
  XLSX.writeFile(book, `${campaign.name.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) || 'campaign'}-results.xlsx`);
}

function deliveryLabel(status?: string) { return ({ PENDING: 'Pending', SERVER_ACK: 'Server accepted', DELIVERY_ACK: 'Delivered', READ: 'Read', PLAYED: 'Played', ERROR: 'Error', DELETED: 'Deleted' } as Record<string,string>)[String(status || '').toUpperCase()] || status || 'Pending'; }
function latestDelivery(result: CampaignJob['results'][number]) { return result.deliveryStatuses?.length ? result.deliveryStatuses[result.deliveryStatuses.length - 1].status : 'PENDING'; }

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState('');
  const [selected, setSelected] = useState<CampaignJob | null>(null);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try { setCampaigns(await campaignJobsApi.list(100)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load campaigns.'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const action = async (id: string, operation: 'pause' | 'resume' | 'cancel' | 'retryFailed') => {
    setActionId(id);
    try { await campaignJobsApi[operation](id); await load(true); toast.success(operation === 'cancel' ? 'Campaign cancelled' : operation === 'pause' ? 'Campaign paused' : operation === 'resume' ? 'Campaign resumed' : 'Failed recipients queued for retry'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Campaign action failed.'); }
    finally { setActionId(''); }
  };

  useEffect(() => {
    void load();
    void loadAnalytics();
    const timer = window.setInterval(() => { void load(true); void loadAnalytics(); }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const loadAnalytics = async (days = analyticsDays) => {
    setAnalyticsLoading(true);
    try { setAnalytics(await campaignJobsApi.analytics(days)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load analytics.'); }
    finally { setAnalyticsLoading(false); }
  };

  return <div className="campaignsPage">
    <section className="hero campaignsHero">
      <div>
        <p className="eyebrow">CAMPAIGNS</p>
        <h1>Campaigns</h1>
        <p>Track queued, running and completed message campaigns from one place.</p>
      </div>
      <button type="button" className="secondary campaignRefresh" onClick={() => void load(true)} disabled={refreshing}>
        {refreshing ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Refresh
      </button>
    </section>

    <section className="analyticsSection">
      <div className="analyticsHeader">
        <div><p className="eyebrow">PERFORMANCE</p><h2><BarChart3 size={15} /> Campaign analytics</h2><p>Execution and delivery metrics for the selected time window.</p></div>
        <select className="analyticsWindow" value={analyticsDays} onChange={(e) => { const days = Number(e.target.value); setAnalyticsDays(days); void loadAnalytics(days); }}>
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="60">Last 60 days</option><option value="90">Last 90 days</option>
        </select>
      </div>
      {analyticsLoading && !analytics ? <div className="analyticsLoading"><Loader2 size={16} className="spin" /> Loading analytics…</div> : analytics ? <>
        <div className="analyticsCards">
          <div><span>Recipients</span><strong>{analytics.overview.totalRecipients}</strong></div>
          <div><span>Sent</span><strong>{analytics.overview.sent}</strong></div>
          <div><span>Delivered</span><strong>{analytics.overview.delivered}</strong><small>{analytics.overview.deliveryRate}% of sent</small></div>
          <div><span>Read</span><strong>{analytics.overview.read}</strong><small>{analytics.overview.readRate}% of sent</small></div>
          <div><span>Failed</span><strong>{analytics.overview.failed}</strong><small>{analytics.overview.failureRate}% of sent</small></div>
          <div><span>Campaigns</span><strong>{analytics.overview.campaigns}</strong><small>{analytics.overview.completed} completed</small></div>
        </div>
        <div className="analyticsGrid">
          <div className="analyticsPanel">
            <div className="analyticsPanelHead"><strong>Daily activity</strong><span>{analytics.days} days</span></div>
            <div className="analyticsChart">
              {analytics.daily.map((day, index) => {
                const max = Math.max(1, ...analytics.daily.map((item) => Math.max(item.sent, item.failed)));
                const height = Math.max(3, Math.max(day.sent, day.failed) / max * 100);
                return <div className="analyticsBar" key={day.date} title={`${day.date}: ${day.sent} sent, ${day.failed} failed`}>
                  <i style={{ height: `${height}%` }}><b style={{ height: `${day.sent ? day.sent / Math.max(day.sent, day.failed) * 100 : 0}%` }} /></i>
                  <span>{index % Math.max(1, Math.ceil(analytics.daily.length / 15)) === 0 ? day.date.slice(5) : ''}</span>
                </div>;
              })}
            </div>
          </div>
          <div className="analyticsPanel">
            <div className="analyticsPanelHead"><strong>Delivery funnel</strong><span>recipient level</span></div>
            {[['Sent', analytics.overview.sent, 100], ['Delivered', analytics.overview.delivered, analytics.overview.deliveryRate], ['Read', analytics.overview.read, analytics.overview.readRate], ['Played', analytics.overview.played, analytics.overview.sent ? analytics.overview.played / analytics.overview.sent * 100 : 0], ['Failed', analytics.overview.failed, analytics.overview.failureRate]].map(([name, value, width]) =>
              <div className="funnelRow" key={String(name)}><span>{name}</span><b>{value}</b><i><em style={{ width: `${Math.min(100, Number(width))}%` }} /></i></div>
            )}
          </div>
        </div>
        <div className="analyticsPanel">
          <div className="analyticsPanelHead"><strong>Campaign performance</strong><span>{analytics.campaigns.length} campaigns</span></div>
          <div className="analyticsTableWrap"><table className="analyticsTable"><thead><tr><th>Campaign</th><th>Status</th><th>Recipients</th><th>Sent</th><th>Failed</th><th>Delivered</th><th>Read</th><th>Delivery</th><th>Read rate</th></tr></thead>
            <tbody>{analytics.campaigns.map((c) => <tr key={c.id}><td><strong>{c.name}</strong><span>{labels[c.type as CampaignJob['type']] || c.type}</span></td><td>{c.status}</td><td>{c.total}</td><td>{c.sent}</td><td>{c.failed}</td><td>{c.delivered}</td><td>{c.read}</td><td>{c.deliveryRate}%</td><td>{c.readRate}%</td></tr>)}</tbody>
          </table></div>
        </div>
      </> : null}
    </section>

    {loading ? <section className="campaignEmpty"><Loader2 size={22} className="spin" /><span>Loading campaigns…</span></section>
      : !campaigns.length ? <section className="campaignEmpty"><div className="campaignEmptyIcon"><Send size={22} /></div><h2>No campaigns yet</h2><p>Create a campaign from Send Message and it will appear here automatically.</p></section>
      : <section className="campaignList">{campaigns.map((campaign) => {
        const remaining = Math.max(0, campaign.total - campaign.sent - campaign.failed);
        const progress = campaign.total ? Math.round(((campaign.sent + campaign.failed) / campaign.total) * 100) : 0;
        return <article className="campaignCard" key={campaign.id}>
          <div className="campaignCardHead">
            <div className="campaignIcon"><MessageSquare size={17} /></div>
            <div className="campaignMain"><strong>{campaign.name}</strong><span>{labels[campaign.type]} · {campaign.instance}</span></div>
            <span className={`campaignStatus ${campaign.status}`}>{campaign.status}</span>
          </div>
          <div className="campaignProgress"><div><span>{campaign.sent + campaign.failed} / {campaign.total} processed</span><b>{progress}%</b></div><i style={{ width: `${progress}%` }} /></div>
          <div className="campaignMetrics">
            <div><strong>{campaign.sent}</strong><span>Sent</span></div>
            <div><strong>{campaign.failed}</strong><span>Failed</span></div>
            <div><strong>{remaining}</strong><span>Remaining</span></div>
            <div><strong><Clock3 size={12} /> {formatDate(campaign.createdAt)}</strong><span>Created</span></div>
          </div>
        </article>;
      })}</section>}
  </div>;
}