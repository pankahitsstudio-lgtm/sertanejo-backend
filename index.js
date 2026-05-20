const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const MP_TOKEN  = 'APP_USR-8088131403832247-051917-32de282c24f8eae8af327ed98f67743a-301230581';
const BIN_ID    = '6a0cd1b26877513b279cbbdc';
const BIN_KEY   = '$2a$10$LWYMLt7gqG4jS.dMYXQBcOrH7vOxmnwfuap17/fEkRpRg1YhBzqnu';
const WPP_TOKEN = process.env.WPP_TOKEN || '';
const WPP_INST  = process.env.WPP_INST  || '';
const SITE_URL  = process.env.SITE_URL  || 'https://sertanejoonboardoficial.netlify.app';

async function lerVagas() {
  const r = await fetch('https://api.jsonbin.io/v3/b/' + BIN_ID + '/latest', {
    headers: { 'X-Master-Key': BIN_KEY }
  });
  const d = await r.json();
  return d.record || { camarote: {}, deck: {} };
}

async function salvarVagas(vagas) {
  await fetch('https://api.jsonbin.io/v3/b/' + BIN_ID, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': BIN_KEY },
    body: JSON.stringify(vagas)
  });
}

app.post('/criar-pagamento', async (req, res) => {
  const { nome, tel, tipo, vaga, valor } = req.body;
  if (!nome || !tipo || !valor) return res.status(400).json({ erro: 'Dados incompletos' });
  const vagas = await lerVagas();
  if (vaga && vagas[tipo][vaga]) return res.status(409).json({ erro: 'Vaga ja reservada' });
  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MP_TOKEN, 'X-Idempotency-Key': nome + '-' + tipo + '-' + vaga + '-' + Date.now() },
      body: JSON.stringify({ transaction_amount: Number(valor), description: 'Sertanejo On Board 21/06 - ' + (tipo === 'camarote' ? 'Camarote' : 'Deck') + ' Vaga ' + vaga, payment_method_id: 'pix', notification_url: SITE_URL.replace('netlify.app','railway.app') + '/webhook', payer: { email: 'comprador.' + Date.now() + '@sertanejoonboard.com', first_name: nome.split(' ')[0], last_name: nome.split(' ').slice(1).join(' ') || 'Cliente', identification: { type: 'CPF', number: '00000000000' } }, metadata: { nome, tel, tipo, vaga: String(vaga) } })
    });
    const payment = await response.json();
    if (!payment.id) return res.status(500).json({ erro: 'Erro ao criar pagamento', detalhe: payment });
    const txData = payment.point_of_interaction && payment.point_of_interaction.transaction_data;
    res.json({ payment_id: payment.id, qr_code_base64: txData && txData.qr_code_base64, qr_code: txData && txData.qr_code, status: payment.status });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const { type, data } = req.body;
  if (type !== 'payment' || !data || !data.id) return;
  try {
    const r = await fetch('https://api.mercadopago.com/v1/payments/' + data.id, { headers: { 'Authorization': 'Bearer ' + MP_TOKEN } });
    const payment = await r.json();
    if (payment.status !== 'approved') return;
    const { nome, tel, tipo, vaga } = payment.metadata || {};
    if (!tipo || !vaga) return;
    const vagas = await lerVagas();
    if (!vagas[tipo]) vagas[tipo] = {};
    vagas[tipo][vaga] = nome;
    await salvarVagas(vagas);
    console.log('Vaga reservada: ' + tipo + ' #' + vaga + ' - ' + nome);
  } catch (err) { console.error('Erro no webhook:', err.message); }
});

app.get('/status/:payment_id', async (req, res) => {
  try {
    const r = await fetch('https://api.mercadopago.com/v1/payments/' + req.params.payment_id, { headers: { 'Authorization': 'Bearer ' + MP_TOKEN } });
    const p = await r.json();
    res.json({ status: p.status, nome: p.metadata && p.metadata.nome, tipo: p.metadata && p.metadata.tipo, vaga: p.metadata && p.metadata.vaga });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/', (req, res) => { res.json({ ok: true, servico: 'Sertanejo On Board Backend', versao: '1.0' }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor rodando na porta ' + PORT));
