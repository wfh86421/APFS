import Fastify from 'fastify';

const app = Fastify({ logger: true });

const port = Number(process.env.PORT ?? 3001);

app.get('/health', async () => ({ status: 'ok', service: 'shieldscan-api' }));

app.post('/v1/reports', async (request, reply) => {
  // TODO: Report Normalizer → Analysis → Scoring → Policy → Output
  reply.code(501).send({ error: 'not_implemented' });
});

app.get('/v1/reports/:id', async (request, reply) => {
  reply.code(501).send({ error: 'not_implemented' });
});

app.get('/v1/plugin-profile', async (request, reply) => {
  reply.code(501).send({ error: 'not_implemented' });
});

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
