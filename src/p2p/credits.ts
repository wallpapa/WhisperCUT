/**
 * P2P Credit System — Weighted by compute complexity
 *
 * Credit weights:
 *   hook_score:   1  (fast, small prompt)
 *   weekly_plan:  2  (medium, structured output)
 *   qa_gate:      3  (medium complexity)
 *   vibe_script:  5  (heavy, iterative generation)
 *
 * New users get 10 free credits on signup.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

export const CREDIT_WEIGHTS: Record<string, number> = {
  hook_score:   1,
  weekly_plan:  2,
  qa_gate:      3,
  vibe_script:  5,
};

/** Get credit balance for a user */
export async function getBalance(email: string): Promise<number> {
  const { data } = await supabase
    .from("p2p_credits")
    .select("amount")
    .eq("user_email", email);

  if (!data || data.length === 0) return 0;
  return data.reduce((sum, row) => sum + row.amount, 0);
}

/** Worker earns credits for processing a job */
export async function earnCredits(
  email: string,
  amount: number,
  jobId: string,
  jobType: string
): Promise<void> {
  await supabase.from("p2p_credits").insert({
    user_email: email,
    amount,
    job_id: jobId,
    reason: `earned:${jobType}`,
  });
}

/** Submitter spends credits to submit a job */
export async function spendCredits(
  email: string,
  amount: number,
  jobId: string,
  jobType: string
): Promise<void> {
  await supabase.from("p2p_credits").insert({
    user_email: email,
    amount: -amount,
    job_id: jobId,
    reason: `spent:${jobType}`,
  });
}

/** Grant signup bonus to a new user */
export async function grantSignupBonus(email: string): Promise<void> {
  const balance = await getBalance(email);
  if (balance === 0) {
    await supabase.from("p2p_credits").insert({
      user_email: email,
      amount: 10,
      reason: "bonus:signup",
    });
  }
}

/** Top contributors leaderboard */
export async function getLeaderboard(limit = 10): Promise<Array<{
  email: string;
  earned: number;
  spent: number;
  balance: number;
}>> {
  const { data } = await supabase
    .from("p2p_credits")
    .select("user_email, amount, reason");

  if (!data) return [];

  const users = new Map<string, { earned: number; spent: number }>();
  for (const row of data) {
    const entry = users.get(row.user_email) || { earned: 0, spent: 0 };
    if (row.amount > 0) entry.earned += row.amount;
    else entry.spent += Math.abs(row.amount);
    users.set(row.user_email, entry);
  }

  return Array.from(users.entries())
    .map(([email, { earned, spent }]) => ({
      email,
      earned,
      spent,
      balance: earned - spent,
    }))
    .sort((a, b) => b.earned - a.earned)
    .slice(0, limit);
}
