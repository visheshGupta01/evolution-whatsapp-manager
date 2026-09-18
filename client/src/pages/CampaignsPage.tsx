import { useEffect, useState } from 'react';
import { Clock3, FileText, Loader2, MessageSquare, RefreshCw, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { campaignJobsApi, type CampaignJob } from '../lib/api';
import '../styles/campaigns.css';

const labels: Record<CampaignJob['type'], string> = {
  text: 'Text',
  'media-text': 'Media + Text',
  media: 'Media',
  buttons: 'Buttons',
  list: 'List',
};

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
    const timer = window.setInterval(() => void load(true), 2000);
    return () => window.clearInterval(timer);
  }, []);

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
