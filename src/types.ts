export type Attendance = 'yes' | 'maybe' | 'no';
export type Profile = { id: string; name: string; attendance: Attendance; guests: number; note: string; avatar_path: string | null; created_at: string };
export type Proposal = { id: string; user_id: string; kind: 'place' | 'idea'; title: string; description: string; location: string; budget: number | null; link: string; category: string; created_at: string };
export type Vote = { user_id: string; proposal_id: string };
export type Data = { profiles: Profile[]; proposals: Proposal[]; votes: Vote[] };
