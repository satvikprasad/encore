// Mirrors api/app/schemas.py and AGENTS.md §5 — THE CONTRACT.
// Changing anything here requires updating schemas.py, the affected fixture, and telling the team.

export type Vec7 = [number, number, number, number, number, number, number];
export type Need = "mobility" | "sensory" | "hearing" | "vision" | "chronic" | "neurodivergent";

export interface User { id: string; name: string; avatar: string; budget_max: number | null; accessibility_needs: Need[]; verified: boolean; weights: Vec7 }
export interface Artist { id: string; name: string; genres: string[] }
export interface Venue { id: string; name: string; lat: number; lng: number; multi_room: boolean;
  access_profile: { step_free: boolean; ada_seating: boolean; quiet_room: boolean; strobe_policy: "none" | "warned" | "unrestricted"; interpreter: "on_request" | "never" } }
export interface Event { id: string; artist: Artist; venue: Venue; start_at: string; doors_at: string | null; price_min: number | null; price_max: number | null; tm_url: string | null; image_url?: string | null; support?: string | null; room?: string | null; is_past: boolean } // tm_url = the primary seller's page; image/support/room from the venue sites
export interface Review { user_id: string; event_id: string; scores: Vec7; tags: string[]; price_paid: number | null } // scores[6] = would_again ? 5 : 1
export interface RankedShow { event: Event; theta: Vec7; score: number; tier: "S" | "A" | "B" | "C"; rank: number }
export interface Ranking { user_id: string; weights: Vec7; shows: RankedShow[]; comparisons_done: number }
export interface MatchCandidate { user: User; match_pct: number; shared_event_ids: string[]; explanation: string | null; icebreaker: string | null }
export interface MediaMatch { cluster_id: string; event: Event; confidence: number; photo_count: number; suggested: "auto" | "ask"; item_indices?: number[] } // item_indices: positions in the posted items
export interface Crew { id: string; event: Event; members: User[]; messages: { user_id: string; text: string; at: string }[]; plan: Plan | null }
export interface Plan { option: { event_id: string; tier_label: string; price: number }; meet_at: string; meet_where: string; per_member: { user_id: string; score: number; note: string }[]; compromise_note: string; summary: string }

// ---- request bodies & composite responses (AGENTS.md §6) ----
export interface MediaItem { lat: number; lng: number; captured_at: string }
export interface MediaMatchRequest { items: MediaItem[] }
export interface AttendanceConfirmRequest { event_ids: string[]; evidence: "photo" | "manual"; confidences?: number[] }
export interface AttendanceConfirmResponse { added: number }
export type ReviewIn = Omit<Review, "user_id">;
export interface ComparePair { event_a: Event; event_b: Event }
export interface ReviewPostResponse { ok: true; next_compare: ComparePair | null } // null until 2 shows reviewed
export interface CompareNext { event_a: Event; event_b: Event; question: string }
export interface CompareRequest { event_a: string; event_b: string; winner: string }
export type EventWithFriends = Event & { friends_interested: User[] };
export interface EventDetail { event: Event; friends_interested: User[]; attendance: string | null }
export interface ErrorResponse { error: string }
export interface VerifyStartResponse { session_id: string; url: string }
export interface CrewCreateRequest { event_id: string; member_ids: string[] }
export interface CrewMessageRequest { text: string }

// ---- discovery: search, recommendations, status, people (AGENTS.md §6) ----
export type RecommendedEvent = EventWithFriends & { reason: string; score: number };
export type AttendanceStatus = "interested" | "going" | "attended";
export interface AttendanceSetRequest { event_id: string; status: AttendanceStatus | null } // null clears the mark
export interface AttendanceSetResponse { event_id: string; status: AttendanceStatus | null }
export interface PersonCard { user: User; match_pct: number; shows_count: number; following: boolean; follows_you: boolean }
export interface UpcomingPlan { event: Event; status: "interested" | "going" }
export interface UserProfile { user: User; following: boolean; follows_you: boolean; followers: number; following_count: number; match_pct: number | null; shows: RankedShow[]; upcoming: UpcomingPlan[] } // match_pct null for yourself
export interface FollowRequest { user_id: string; follow: boolean }
export interface FollowResponse { following: string[] }
export interface MediaFile { id: string; user: User; event: Event; kind: "image" | "video"; url: string; content_type: string; bytes: number; caption: string | null; taken_at: string | null; created_at: string } // a photo/video attached to a show; visible to the uploader's followers
export interface TicketOffer { seller: string; kind: "primary" | "resale"; url: string; price_min: number | null; price_max: number | null; status: string | null; fetched_at: string } // prices null until a keyed source fills them
