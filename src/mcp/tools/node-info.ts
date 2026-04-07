/**
 * whispercut_node_info — Show this node's detected resources + network overview
 */

import { detectCapabilities, formatCapabilities } from "../../p2p/resource-detector.js";
import { getNetworkResources } from "../../p2p/resource-router.js";
import { getProviderInfo } from "../../ai/provider.js";
import { getBalance } from "../../p2p/credits.js";
import { getBestPractices } from "../../p2p/rl-engine.js";

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

export const nodeInfoTool = {
  name: "whispercut_node_info",
  description:
    "Show this node's detected resources (AI, FFmpeg, Whisper, Tavily, Canva, Storage), " +
    "the P2P network resource map (who has what), credit balance, " +
    "and RL best practices learned from real data. " +
    "Use to see what your node can do and what the network offers.",
  inputSchema: { type: "object" as const, properties: {} },
};

export async function handleNodeInfo() {
  // Detect local resources
  const caps = await detectCapabilities();
  const providerInfo = getProviderInfo();
  const balance = await getBalance(USER_EMAIL);
  const tier = process.env.RESOURCE_TIER || "free";

  // Network overview
  const network = await getNetworkResources();

  // RL best practices
  const bestPractices = await getBestPractices();
  const rlSummary: Record<string, string> = {};
  for (const [dim, val] of Object.entries(bestPractices)) {
    if (val) {
      rlSummary[dim] = `${val.best} (win rate: ${(val.win_rate * 100).toFixed(0)}%, samples: ${val.sample_size})`;
    }
  }

  return {
    this_node: {
      email: USER_EMAIL,
      ai_provider: `${providerInfo.provider}/${providerInfo.model}`,
      tier,
      credits: balance,
      resources: formatCapabilities(caps),
    },
    network: {
      online: network.online_nodes,
      total_registered: network.total_nodes,
      resource_map: network.resources,
      nodes: network.nodes,
    },
    rl_best_practices: rlSummary,
  };
}
