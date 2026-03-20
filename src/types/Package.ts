// ── Pantry catalog types ─────────────────────────────────────────────

export interface PackageSummary {
  command_name: string;
  display_name: string;
  description: string;
  author: string | null;
  latest_version: string;
  categories: string[];
  install_count: number;
  danger_rating: number;
  verified: boolean;
  icon_url: string;
  package_type: 'command' | 'bundle';
  components: PackageComponent[];
}

export interface PackageComponent {
  type: 'command' | 'agent' | 'device_protocol' | 'device_manager' | 'prompt_provider';
  name: string;
  path: string;
  description: string;
}

export interface PackageAuthor {
  github: string;
  display_name: string;
  avatar_url: string;
}

export interface SecurityReport {
  summary: string;
  danger_score: number;
  concerns: string[];
  recommendation: 'approve' | 'flag' | 'reject';
  reviewed_at: string;
}

export interface PackageDetail {
  command_name: string;
  display_name: string;
  description: string;
  github_repo_url: string;
  author: PackageAuthor | null;
  latest_version: string;
  categories: string[];
  platforms: string[];
  license: string;
  install_count: number;
  danger_rating: number;
  verified: boolean;
  icon_url: string;
  package_type: 'command' | 'bundle';
  components: PackageComponent[];
  created_at: string;
  updated_at: string;
  security_report: SecurityReport | null;
  review_count: number;
  avg_rating: number | null;
}

export interface PackageReview {
  id: string;
  rating: number;
  comment: string;
  author: string;
  created_at: string;
}

export interface PackageCategory {
  name: string;
  count: number;
}

export interface PackageDownloadInfo {
  command_name: string;
  github_repo_url: string;
  version: string;
  git_tag: string;
  manifest: Record<string, any>;
  danger_rating: number;
  verified: boolean;
}

// ── Install request/status types ─────────────────────────────────────

export interface InstallRequest {
  id: string;
  status: string;
  created_at: string;
}

export type InstallStatusValue = 'pending' | 'completed' | 'failed' | 'expired';

export interface InstallStatus {
  status: InstallStatusValue;
  request_id: string;
  command_name: string;
  error_message: string | null;
  details: Record<string, any> | null;
}
