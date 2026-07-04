# Velvet Bot VPS Checklist

## First deploy

```bash
cd ~/Bot-UGC
git pull
npm install
npm run test
chmod 600 .env
pm2 restart velvet-bot
pm2 save
```

## Nginx + HTTPS

Copy the example config:

```bash
sudo cp deploy/nginx-velvet-bot.conf.example /etc/nginx/sites-available/velvet-bot
sudo nano /etc/nginx/sites-available/velvet-bot
sudo ln -s /etc/nginx/sites-available/velvet-bot /etc/nginx/sites-enabled/velvet-bot
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d api.seudominio.com
```

After HTTPS is working, set:

```env
MERCADO_PAGO_WEBHOOK_URL=https://api.seudominio.com/mercadopago/webhook
WEBHOOK_HOST=127.0.0.1
WEBHOOK_PORT=3001
```

Then block direct public access to port 3001:

```bash
sudo ufw deny 3001/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## Mercado Pago

Set a webhook URL in Mercado Pago:

```text
https://api.seudominio.com/mercadopago/webhook
```

If Mercado Pago gives you a webhook secret, save it:

```env
MERCADO_PAGO_WEBHOOK_SECRET=
```

Rotate the access token before production if it was ever pasted in chat.

## Stripe

Set the payment provider:

```env
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_WEBHOOK_URL=https://api.seudominio.com/stripe/webhook
STRIPE_SUCCESS_URL=https://discord.com
STRIPE_CANCEL_URL=https://discord.com
```

In Stripe Dashboard, create a webhook endpoint:

```text
https://api.seudominio.com/stripe/webhook
```

Subscribe to these events:

```text
checkout.session.completed
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
```

Enable Pix in Stripe Dashboard payment methods if it is available for your account.

## Backups

```bash
mkdir -p ~/backups-bot
test -f data/refazer_wallet.json && cp data/refazer_wallet.json ~/backups-bot/refazer_wallet-$(date +%F-%H%M).json
```

## Health checks

```bash
curl http://127.0.0.1:3001/health
curl https://api.seudominio.com/health
pm2 status
pm2 logs velvet-bot --lines 100
```
