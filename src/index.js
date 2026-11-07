import { createServer } from './server.js';
import { startDiscordBot } from './discord.js';
import { startDemo } from './demo.js';

const env = process.env;
const display = createServer({ port: Number(env.PORT) || 3000, viewKey: env.VIEW_KEY || '' });

if (process.argv.includes('--demo')) {
  startDemo({ display });
} else if (!env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN manquant : copie .env.example en .env et remplis-le.');
  console.error('Pour tester sans Discord : npm run demo');
  process.exit(1);
} else if (!env.FOLLOW_USER_ID && !(env.GUILD_ID && env.VOICE_CHANNEL_ID)) {
  console.error('Renseigne FOLLOW_USER_ID, ou GUILD_ID + VOICE_CHANNEL_ID, dans .env.');
  process.exit(1);
} else {
  startDiscordBot({
    token: env.DISCORD_TOKEN,
    followUserId: env.FOLLOW_USER_ID,
    guildId: env.GUILD_ID,
    voiceChannelId: env.VOICE_CHANNEL_ID,
    display,
  });
}
