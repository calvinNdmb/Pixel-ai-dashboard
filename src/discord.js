// Bot Discord : rejoint le salon vocal et signale qui parle, en direct.
import { ApplicationCommandOptionType, Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import {
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from '@discordjs/voice';
import { ACTIONS, EMOTES } from '../public/actions.js';

// Commandes slash : /taper @quelqu'un, /danse, /emote...
const COMMANDS = [
  ...ACTIONS.map((a) => ({
    name: a.id,
    description: a.description,
    options: a.target
      ? [{ type: ApplicationCommandOptionType.User, name: 'cible', description: 'Qui ?', required: true }]
      : [],
  })),
  {
    name: 'emote',
    description: 'Afficher une réaction au-dessus de ton personnage',
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: 'emoji',
        description: 'Laquelle ?',
        required: true,
        choices: EMOTES.map((e) => ({ name: `${e.emoji} ${e.label}`, value: e.id })),
      },
    ],
  },
];

async function registerCommands(guild) {
  try {
    await guild.commands.set(COMMANDS);
  } catch (err) {
    console.warn(
      `[discord] commandes slash non installées sur « ${guild.name} » (${err.message}). ` +
        'Ré-invite le bot avec le lien du README (scope applications.commands).',
    );
  }
}

/** Traite une commande slash (/taper @quelqu'un, /danse, /emote...). */
export async function handleCommand(interaction, display) {
  if (!interaction.isChatInputCommand()) return;
  const isEmote = interaction.commandName === 'emote';
  const def = ACTIONS.find((a) => a.id === interaction.commandName);
  if (!def && !isEmote) return;

  const target = def?.target ? interaction.options.getUser('cible') : null;
  const result = display.triggerAction({
    from: interaction.user.id,
    action: isEmote ? 'emote' : def.id,
    target: target?.id,
    emote: isEmote ? interaction.options.getString('emoji') : undefined,
  });

  let content;
  if (!result.ok) content = `❌ ${result.error}`;
  else if (isEmote) content = `${result.emote.emoji} Réaction envoyée !`;
  else if (!def.target) content = `${def.icon} ${def.done}`;
  else {
    const name = interaction.options.getMember('cible')?.displayName ?? target?.displayName ?? '';
    content = `${def.icon} ${def.done.replace('{cible}', `**${name}**`)}`;
  }
  // Réponse visible seulement par la personne (pas de spam dans le salon).
  await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
}

export function startDiscordBot({ token, followUserId, guildId, voiceChannelId, display }) {
  const client = new Client({
    // Pas d'intent privilégié nécessaire : les états vocaux suffisent.
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  let current = null; // { guildId, channelId }

  const memberInfo = (member) => ({
    id: member.id,
    name: member.displayName,
    avatar: member.displayAvatarURL({ extension: 'png', size: 128 }),
  });

  function refreshMembers() {
    if (!current) return;
    const channel = client.channels.cache.get(current.channelId);
    if (!channel?.isVoiceBased()) return;
    display.setMembers(
      [...channel.members.values()].filter((m) => m.id !== client.user.id).map(memberInfo),
    );
  }

  function disconnect() {
    if (!current) return;
    getVoiceConnection(current.guildId)?.destroy();
    current = null;
  }

  function leave() {
    if (!current) return;
    disconnect();
    display.setChannel(null);
    console.log('[discord] salon vocal quitté');
  }

  function join(channel) {
    if (current?.channelId === channel.id) return;
    // Changement de salon : on repart d'une connexion propre (évite les écouteurs en double).
    disconnect();

    current = { guildId: channel.guildId, channelId: channel.id };
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false, // indispensable : un bot sourd ne reçoit pas les paquets audio
      selfMute: true,
    });

    connection.receiver.speaking.on('start', (userId) => display.setSpeaking(userId, true));
    connection.receiver.speaking.on('end', (userId) => display.setSpeaking(userId, false));

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Déplacement de salon ou micro-coupure : Discord se reconnecte tout seul.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        // Vraiment déconnecté (expulsé, salon supprimé...).
        if (getVoiceConnection(channel.guildId) === connection) leave();
      }
    });

    display.setChannel({ name: channel.name });
    refreshMembers();
    console.log(`[discord] salon rejoint : ${channel.guild.name} / ${channel.name}`);
  }

  client.once(Events.ClientReady, async () => {
    console.log(`[discord] connecté en tant que ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) registerCommands(guild);

    if (followUserId) {
      // Si la personne suivie est déjà en vocal, on la rejoint tout de suite.
      for (const guild of client.guilds.cache.values()) {
        const channel = guild.voiceStates.cache.get(followUserId)?.channel;
        if (channel) return join(channel);
      }
      console.log('[discord] en attente que tu rejoignes un salon vocal...');
    } else if (guildId && voiceChannelId) {
      const channel = await client.channels.fetch(voiceChannelId).catch(() => null);
      if (channel?.isVoiceBased()) join(channel);
      else console.error('[discord] VOICE_CHANNEL_ID introuvable ou pas un salon vocal');
    }
  });

  client.on(Events.GuildCreate, (guild) => registerCommands(guild));

  client.on(Events.InteractionCreate, (interaction) => handleCommand(interaction, display));

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.id === client.user.id) {
      // Le bot lui-même a été déplacé ou déconnecté par quelqu'un.
      if (!newState.channelId) leave();
      else if (current && newState.channelId !== current.channelId) {
        current.channelId = newState.channelId;
        display.setChannel({ name: newState.channel.name });
        refreshMembers();
      }
      return;
    }

    if (followUserId && newState.id === followUserId) {
      if (newState.channel) join(newState.channel);
      else leave();
      return;
    }

    // Quelqu'un arrive, part, ou change de pseudo/avatar dans notre salon.
    if (current && (oldState.channelId === current.channelId || newState.channelId === current.channelId)) {
      refreshMembers();
    }
  });

  client.login(token).catch((err) => {
    console.error(`[discord] connexion impossible : ${err.message}`);
    process.exit(1);
  });

  const shutdown = () => {
    leave();
    client.destroy().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
