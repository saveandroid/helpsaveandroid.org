import { handle } from '@astrojs/cloudflare/handler';
import { refreshCandidateCounts } from '@/lib/representatives/db';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },

  scheduled(_controller, env, ctx) {
    ctx.waitUntil(refreshCandidateCounts(env.HSA_VOTES_DB));
  },
} satisfies ExportedHandler<Env>;
