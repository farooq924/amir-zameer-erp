# WhatsApp setup (AMIR ZAMEER ERP v1.8.0)

The ERP sends WhatsApp messages in two ways:

| Mode | Setup | How it works |
|---|---|---|
| **Manual** (default) | None | Click **WhatsApp** on an order, payment or customer. The ERP fills the message and opens WhatsApp (phone or WhatsApp Web). You press **Send**. The message is logged on the WhatsApp page. |
| **Cloud API** (official Meta API) | One time, below | The ERP sends the message itself, shows delivered / read ticks, retries when WhatsApp is busy and can send automatic messages (order booked, ready, delivered, payment received). |

## Cloud API: one-time setup

You need: a Facebook account, a business mobile number that is **not** already used in the normal WhatsApp app
(or remove it from the app first), and the ERP online at your domain (https://tailoringerp.brandistan.pk).

1. Open https://business.facebook.com and create (or open) your **Business Portfolio** for AMIR ZAMEER.
2. Open https://developers.facebook.com > **My Apps** > **Create app** > choose **Business** type > select your Business Portfolio.
3. In the new app, click **Add product** > **WhatsApp** > **Set up**.
4. Go to **WhatsApp > API Setup**:
   * Click **Add phone number** and verify your business number with the SMS / call code.
   * Copy the **Phone number ID** and the **WhatsApp Business Account ID** shown on this page.
5. Permanent token: Business settings (business.facebook.com/settings) > **Users > System users** > **Add** (role Admin) >
   **Assign assets** > your app (Full control) and your WhatsApp account (Full control) > **Generate new token** > select your app,
   expiry **Never**, permissions `whatsapp_business_messaging` and `whatsapp_business_management` > copy the token.
6. App secret: developers.facebook.com > your app > **App settings > Basic** > **App secret** > Show > copy.
7. In the ERP: **WhatsApp > Settings**:
   * Paste **Phone number ID**, **WhatsApp Business Account ID**, **Permanent access token**, **App secret**.
   * Turn on **Send through the Cloud API** and click **Save**, then **Test connection** (it shows your number).
8. Webhook (for delivered / read ticks and STOP replies): in Meta, **WhatsApp > Configuration > Webhook > Edit**:
   * **Callback URL** and **Verify token**: copy both from ERP **WhatsApp > Settings** (use the copy buttons) > **Verify and save**.
   * Under **Webhook fields**, click **Subscribe** next to **messages**.
9. Templates: in **WhatsApp Manager > Message templates** (business.facebook.com/wa/manage/message-templates) create each
   template from ERP **WhatsApp > Templates** with exactly the same **name**, **language** (English, code `en`), category **Utility**
   and the same text with {{1}}, {{2}} ... Submit. Approval usually takes minutes to a few hours.
10. In the ERP click **WhatsApp > Templates > Check status in Meta**. Approved templates show a green **Approved** badge.
11. Add a payment method in Meta Business settings (WhatsApp charges per conversation after the free monthly allowance).

## Rules the ERP follows
* Cloud API messages go only to customers who agreed (tick **Customer agrees to receive WhatsApp messages** on the customer,
  or the switch on the customer's **WhatsApp** tab). This follows WhatsApp policy and can be changed in Settings.
* Customers can reply **STOP** to stop and **START** to agree again; the customer record updates by itself.
* Automatic messages (WhatsApp > Settings > Automatic messages) are sent once per order / payment event.
* Temporary errors are retried after 1, 2, 4, 8 ... minutes (up to "Tries before a message fails"). Failed messages can be sent
  again from the WhatsApp page.
* Demo customers are never messaged through the Cloud API (their numbers are made up).
* The access token and app secret are never shown again after saving (only the last 4 characters).
