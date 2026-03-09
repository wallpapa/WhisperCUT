/**
 * Supabase client — project data + video storage
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/** Get Supabase client (singleton) */
export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY) required");
  }

  _client = createClient(url, key);
  return _client;
}

/** Check if Supabase is configured */
export function hasSupabase(): boolean {
  return !!(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY));
}

// --- Project CRUD ---

export interface Project {
  id?: string;
  name: string;
  language: string;
  status: string;
  source_video_url?: string;
  rendered_video_url?: string;
  transcript?: any;
  timeline?: any;
  feedback_scores?: any;
  tiktok_url?: string;
}

export async function createProject(project: Project) {
  const { data, error } = await getSupabase()
    .from("projects")
    .insert(project)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(id: string, updates: Partial<Project>) {
  const { data, error } = await getSupabase()
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getProject(id: string) {
  const { data, error } = await getSupabase()
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listProjects(limit = 20) {
  const { data, error } = await getSupabase()
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// --- Analytics ---

export interface AnalyticsEntry {
  project_id: string;
  hook_score: number;
  cta_score: number;
  pacing_score: number;
  engagement_score: number;
  improvements?: any;
  iteration: number;
}

export async function saveAnalytics(entry: AnalyticsEntry) {
  const { data, error } = await getSupabase()
    .from("analytics")
    .insert(entry)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- Storage ---

export async function uploadVideo(
  filePath: string,
  bucket = "videos"
): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const buffer = await readFile(filePath);
  const fileName = `${Date.now()}_${path.basename(filePath)}`;

  const { error } = await getSupabase()
    .storage.from(bucket)
    .upload(fileName, buffer, { contentType: "video/mp4" });
  if (error) throw error;

  const { data } = getSupabase().storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}
