// Hand-written types matching the existing ZEWJOUNA backend contract (public schema).
export type Gender = "female" | "male" | "nonbinary";
export type LookingFor = "female" | "male" | "nonbinary" | "everyone";
export type SwipeAction = "like" | "pass";
export type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

export interface ProfileRow {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  photos: string[] | null;
  birthdate: string | null;
  gender: Gender | null;
  looking_for: LookingFor | null;
  location: string | null;
  community_tags: string[] | null;
  verified: boolean | null;
  last_active_at: string | null;
  created_at: string | null;
}

export interface SwipeRow {
  id: string;
  swiper_id: string;
  swiped_id: string;
  action: SwipeAction;
  created_at: string;
}

export interface MatchRow {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  expires_at: string | null;
  conversation_started: boolean | null;
}

export interface MessageRow {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

export interface BlockRow {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export interface ReportRow {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
}

export interface CandidateRow {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  photos: string[] | null;
  age: number | null;
  gender: Gender | null;
  community_tags: string[] | null;
  shared_tags: string[] | null;
  distance_m: number | null;
}

export interface MatchProfileRow {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  age: number | null;
  gender: Gender | null;
  community_tags: string[] | null;
  verified: boolean | null;
}

export type Database = {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow>; Update: Partial<ProfileRow>; Relationships: [] };
      swipes: { Row: SwipeRow; Insert: Partial<SwipeRow>; Update: Partial<SwipeRow>; Relationships: [] };
      matches: { Row: MatchRow; Insert: Partial<MatchRow>; Update: Partial<MatchRow>; Relationships: [] };
      messages: { Row: MessageRow; Insert: Partial<MessageRow>; Update: Partial<MessageRow>; Relationships: [] };
      blocks: { Row: BlockRow; Insert: Partial<BlockRow>; Update: Partial<BlockRow>; Relationships: [] };
      reports: { Row: ReportRow; Insert: Partial<ReportRow>; Update: Partial<ReportRow>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { gender: Gender; looking_for: LookingFor };
    CompositeTypes: Record<string, never>;
  };
};
