/**
 * channel-sender-registry — the wiring hub that maps a ChatChannel to its
 * ChannelSender and ChannelContextProvider. The dispatcher resolves both through
 * these registries instead of calling ConnectionManager / DatabaseService
 * directly, so a new channel (Page, Phase 2/3) plugs in by registering its
 * provider + sender — no dispatcher edits.
 */

import type { ChatChannel, ChannelSender, ChannelContextProvider } from './channel-event';

class ChannelSenderRegistry {
  private readonly senders = new Map<ChatChannel, ChannelSender>();

  register(channel: ChatChannel, sender: ChannelSender): void {
    this.senders.set(channel, sender);
  }

  pick(channel: ChatChannel): ChannelSender | null {
    return this.senders.get(channel) ?? null;
  }
}

class ChannelProviderRegistry {
  private readonly providers = new Map<ChatChannel, ChannelContextProvider>();

  register(channel: ChatChannel, provider: ChannelContextProvider): void {
    this.providers.set(channel, provider);
  }

  pick(channel: ChatChannel): ChannelContextProvider | null {
    return this.providers.get(channel) ?? null;
  }
}

/** Process-wide singletons — one dispatcher, one set of channel wirings. */
export const channelSenderRegistry = new ChannelSenderRegistry();
export const channelProviderRegistry = new ChannelProviderRegistry();
