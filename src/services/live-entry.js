// Loaded only when a player connects to a real guild, so the demo never pulls in the chain stack.
import workerUrl from '../../vendor/structs-webapp/js/workers/TaskWorker.js?worker&url';
export { LiveService } from './LiveService.js';
export { workerUrl };
export { resolveGuild, browsableGuilds, lastGuild, DEFAULT_REACTOR } from './live/guildConfig.js';
export { MatrixChat } from './live/MatrixChat.js';
