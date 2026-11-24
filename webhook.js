export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "creperia_junior_2026";
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const CATALOG_URL = process.env.CATALOG_URL || "https://tu-pagina.vercel.app";

  // 1. Verificación del Webhook (Requerido por Meta)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Token de verificación incorrecto");
  }

  // 2. Recepción de mensajes de WhatsApp
  if (req.method === "POST") {
    try {
      const body = req.body;
      const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      // Si no es un mensaje de texto (ej. confirmación de lectura), respondemos OK rápido
      if (!message || message.type !== "text") {
        return res.status(200).send("EVENT_RECEIVED");
      }

      const from = message.from; // Número del cliente
      const userText = message.text.body;

      // 3. Consultar a Gemini para generar la respuesta
      const systemPrompt = `Eres el asistente virtual oficial de "Junior's Creperie". Responde de forma amable, breve y natural (máximo 3-4 líneas, usa emojis con moderación).
Información del negocio:
- Menú y precios: Frappés ($75), Bowl Crepa ($75), Waffle ($65).
- Pedidos y personalización: Los clientes pueden armar su crepa o waffle y elegir su ubicación exacta en el mapa entrando a nuestro catálogo web: ${CATALOG_URL}
- Métodos de pago: Efectivo y transferencia (los detalles finales se confirman al enviar el pedido por WhatsApp).
Si preguntan algo fuera del menú o que requiera atención humana (ej. un pedido especial grande o reclamo), diles que enseguida los atiende una persona del equipo.`;

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
          }),
        }
      );

      const geminiData = await geminiResponse.json();
      const replyText =
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
        `¡Hola! 🧇 En Junior's Creperie tenemos Frappés ($75), Bowl Crepa ($75) y Waffle ($65). Puedes armar tu pedido y enviarnos tu ubicación aquí: ${CATALOG_URL}`;

      // 4. Enviar la respuesta de vuelta por WhatsApp
      await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            text: { body: replyText },
          }),
        }
      );

      return res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      console.error("Error en webhook:", error);
      return res.status(200).send("EVENT_RECEIVED");
    }
  }

  return res.status(405).send("Método no permitido");
}