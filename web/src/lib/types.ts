export type CategoryKey = 'pagamentos' | 'acesso' | 'integracoes' | 'performance' | 'bugs' | 'duvidas';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Status = 'new' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type Sentiment = 'negative' | 'neutral' | 'positive';
export type Channel = 'widget' | 'email' | 'portal' | 'chat' | 'phone' | 'whatsapp';

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'agent';
  title?: string;
  open_tickets?: number;
}

export interface Customer {
  id: number;
  name: string;
  plan: string;
  segment?: string | null;
  mrr: number;
}

export interface Ticket {
  id: number;
  protocol: string;
  subject: string;
  description: string;
  excerpt?: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_plan: string | null;
  requester_name: string;
  requester_email: string;
  channel: Channel;
  status: Status;
  priority: Priority;
  category: CategoryKey | null;
  category_source: 'ai' | 'human';
  ai_category: CategoryKey | null;
  ai_confidence: number | null;
  ai_priority: Priority | null;
  sentiment: Sentiment | null;
  sentiment_score: number | null;
  ai_summary: string | null;
  ai_reply: string | null;
  ai_tags: string[];
  ai_signals: string[];
  ai_engine: string | null;
  ai_analyzed_at: string | null;
  churn_risk: number;
  assignee_id: number | null;
  assignee_name: string | null;
  product_version: string | null;
  origin: string;
  resolved_by_ai: boolean;
  csat: number | null;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  context: TicketContext | null;
}

export interface TicketContext {
  source: 'widget' | 'portal';
  trigger: 'manual' | 'error';
  app?: { name?: string; version?: string };
  page?: { url?: string; path?: string; title?: string };
  user?: { id?: string; name?: string; email?: string; company?: string; plan?: string };
  browser?: { userAgent?: string; language?: string; screen?: string; timezone?: string };
  errors?: { type: 'js' | 'http' | 'promise'; message: string; at?: string; url?: string; method?: string; status?: number }[];
  breadcrumbs?: { type: 'nav' | 'click' | 'http' | 'error'; label: string; at?: string }[];
}

export interface KbRef {
  id: number;
  title: string;
  category: string;
  score: number;
}

export interface Analysis {
  category: CategoryKey;
  confidence: number;
  ranking: { category: CategoryKey; probability: number }[];
  priority: Priority;
  sentiment: Sentiment;
  sentimentScore: number;
  summary: string;
  suggestedReply: string;
  tags: string[];
  signals: string[];
  churnRisk: number;
  kbArticles: KbRef[];
  engine: 'local' | 'claude';
  model: string;
  fallbackReason?: string;
}

export interface Insight {
  id: string;
  type: 'spike' | 'recurring_customer' | 'cluster' | 'sla' | 'sentiment';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  headline: string;
  description: string;
  confidence: number;
  metrics: { label: string; value: string }[];
  ticketIds: number[];
  suggestedAction: string;
  category?: CategoryKey;
  customerId?: number;
}

export interface Article {
  id: number;
  title: string;
  category: CategoryKey;
  body: string;
  tags: string | null;
  views: number;
  helpful: number;
  created_at: string;
  updated_at: string;
}

export interface AiStatus {
  activeEngine: 'claude' | 'local';
  claudeConfigured: boolean;
  claudeModel: string;
  localModel: string;
  trainingExamples: number;
  humanFeedbackExamples: number;
  knowledgeBaseArticles: number;
  claudeCalls: number;
  lastClaudeError: { message: string; at: string } | null;
}
