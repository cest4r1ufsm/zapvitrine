const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// In-memory conversation state (per customer phone per store)
// Format: { "storeId:phone": { step, productId, data: { name, address, time } } }
const conversations = new Map();

function getConvoKey(storeId, phone) {
  return `${storeId}:${phone}`;
}

// WhatsApp Cloud API webhook verification
router.get('/:storeId', async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: parseInt(req.params.storeId) },
    });

    if (!store || !store.botWebhookToken) {
      return res.sendStatus(403);
    }

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === store.botWebhookToken) {
      console.log(`✅ Webhook verificado para loja: ${store.name}`);
      return res.status(200).send(challenge);
    }

    res.sendStatus(403);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

// Receive WhatsApp messages
router.post('/:storeId', async (req, res) => {
  try {
    // Always respond 200 immediately (WhatsApp requirement)
    res.sendStatus(200);

    const store = await prisma.store.findUnique({
      where: { id: parseInt(req.params.storeId) },
      include: {
        categories: { orderBy: { order: 'asc' } },
        products: {
          where: { active: true },
          orderBy: [{ order: 'asc' }],
          include: { category: true },
        },
      },
    });

    if (!store || !store.botEnabled || !store.botToken || !store.botPhoneId) {
      return;
    }

    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    const msgBody = message.text?.body?.trim() || '';
    const msgLower = msgBody.toLowerCase();
    const msgType = message.type;

    // Handle interactive button/list replies
    const interactiveReply = message.interactive;
    const buttonReply = interactiveReply?.button_reply?.id || '';
    const listReply = interactiveReply?.list_reply?.id || '';
    const replyId = buttonReply || listReply;

    const convoKey = getConvoKey(store.id, from);
    const convo = conversations.get(convoKey);

    // Check if user wants to cancel/restart
    if (msgLower === 'cancelar' || msgLower === 'voltar' || msgLower === 'menu' || msgLower === 'inicio' || msgLower === 'início') {
      conversations.delete(convoKey);
      await sendGreeting(store, from);
      return;
    }

    // If we're in a conversation flow (collecting order info)
    if (convo) {
      await handleConversationFlow(store, from, convoKey, convo, msgBody, replyId);
      return;
    }

    // Standard menu navigation
    if (replyId.startsWith('cat_')) {
      const catId = parseInt(replyId.replace('cat_', ''));
      await sendProductsForCategory(store, from, catId);
    } else if (replyId.startsWith('prod_')) {
      const prodId = parseInt(replyId.replace('prod_', ''));
      await sendProductDetail(store, from, prodId);
    } else if (replyId.startsWith('order_')) {
      // Customer wants to order this specific product — start order flow
      const prodId = parseInt(replyId.replace('order_', ''));
      await startOrderFlow(store, from, convoKey, prodId);
    } else if (replyId === 'ver_catalogo' || msgLower === 'catalogo' || msgLower === 'catálogo' || msgLower === 'menu' || msgLower === 'produtos') {
      await sendCatalogMenu(store, from);
    } else if (replyId === 'ver_todos' || msgLower === 'todos' || msgLower === 'tudo') {
      await sendAllProducts(store, from);
    } else if (replyId === 'fazer_pedido' || msgLower === 'pedido' || msgLower === 'pedir') {
      await sendOrderInstructions(store, from);
    } else if (replyId === 'ver_pedidos' || msgLower === 'meus pedidos') {
      await sendCustomerOrders(store, from);
    } else {
      await sendGreeting(store, from);
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }
});

// ===== ORDER CONVERSATION FLOW =====

async function startOrderFlow(store, to, convoKey, productId) {
  const product = store.products.find(p => p.id === productId);
  if (!product) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: 'Produto não encontrado.' },
    });
    return;
  }

  // Save conversation state
  conversations.set(convoKey, {
    step: 'ask_name',
    productId: product.id,
    productName: product.name,
    productPrice: product.price,
    data: {},
  });

  await sendWhatsAppMessage(store, to, {
    type: 'text',
    text: {
      body: `✅ Ótimo! Você escolheu:\n\n📦 *${product.name}*\n💰 R$ ${product.price.toFixed(2).replace('.', ',')}\n\nPara prosseguir com o pedido, me diga:\n\n👤 *Qual é o seu nome?*`,
    },
  });
}

async function handleConversationFlow(store, from, convoKey, convo, msgBody, replyId) {
  switch (convo.step) {
    case 'ask_name': {
      convo.data.name = msgBody;
      convo.step = 'ask_time_or_address';
      conversations.set(convoKey, convo);

      await sendWhatsAppMessage(store, from, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: `Obrigado, *${msgBody}*! 👋\n\nEsse pedido é para:\n\n🕐 *Agendar um horário* (serviço)\n📍 *Entrega em endereço* (produto)`,
          },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'type_schedule', title: '🕐 Agendar Horário' } },
              { type: 'reply', reply: { id: 'type_delivery', title: '📍 Com Endereço' } },
            ],
          },
        },
      });
      break;
    }

    case 'ask_time_or_address': {
      if (replyId === 'type_schedule') {
        convo.step = 'ask_time';
        convo.data.type = 'schedule';
        conversations.set(convoKey, convo);

        await sendWhatsAppMessage(store, from, {
          type: 'text',
          text: {
            body: `🕐 *Qual horário e dia você prefere?*\n\nExemplos:\n• "Amanhã às 14h"\n• "Sábado de manhã"\n• "26/03 às 10:00"`,
          },
        });
      } else if (replyId === 'type_delivery') {
        convo.step = 'ask_address';
        convo.data.type = 'delivery';
        conversations.set(convoKey, convo);

        await sendWhatsAppMessage(store, from, {
          type: 'text',
          text: {
            body: `📍 *Qual é o endereço de entrega?*\n\nEnvie o endereço completo (rua, número, bairro, referência).`,
          },
        });
      } else {
        // If they typed instead of clicking button
        if (msgBody.toLowerCase().includes('horario') || msgBody.toLowerCase().includes('horário') || msgBody.toLowerCase().includes('agendar')) {
          convo.step = 'ask_time';
          convo.data.type = 'schedule';
          conversations.set(convoKey, convo);
          await sendWhatsAppMessage(store, from, {
            type: 'text',
            text: { body: `🕐 *Qual horário e dia você prefere?*\n\nEx: "Amanhã às 14h"` },
          });
        } else {
          convo.step = 'ask_address';
          convo.data.type = 'delivery';
          conversations.set(convoKey, convo);
          await sendWhatsAppMessage(store, from, {
            type: 'text',
            text: { body: `📍 *Qual é o endereço de entrega?*` },
          });
        }
      }
      break;
    }

    case 'ask_time': {
      convo.data.scheduledTime = msgBody;
      convo.step = 'ask_notes';
      conversations.set(convoKey, convo);

      await sendWhatsAppMessage(store, from, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: `⏰ Horário: *${msgBody}*\n\n💬 Deseja adicionar alguma observação ao pedido? (ex: preferências, alergias, etc.)`,
          },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'no_notes', title: '❌ Sem observação' } },
              { type: 'reply', reply: { id: 'add_notes', title: '✏️ Sim, adicionar' } },
            ],
          },
        },
      });
      break;
    }

    case 'ask_address': {
      convo.data.address = msgBody;
      convo.step = 'ask_notes';
      conversations.set(convoKey, convo);

      await sendWhatsAppMessage(store, from, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: `📍 Endereço: *${msgBody}*\n\n💬 Deseja adicionar alguma observação ao pedido?`,
          },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'no_notes', title: '❌ Sem observação' } },
              { type: 'reply', reply: { id: 'add_notes', title: '✏️ Sim, adicionar' } },
            ],
          },
        },
      });
      break;
    }

    case 'ask_notes': {
      if (replyId === 'no_notes') {
        convo.data.notes = null;
        await confirmAndSaveOrder(store, from, convoKey, convo);
      } else if (replyId === 'add_notes') {
        convo.step = 'typing_notes';
        conversations.set(convoKey, convo);
        await sendWhatsAppMessage(store, from, {
          type: 'text',
          text: { body: '✏️ Escreva sua observação:' },
        });
      } else {
        // They typed the note directly
        convo.data.notes = msgBody;
        await confirmAndSaveOrder(store, from, convoKey, convo);
      }
      break;
    }

    case 'typing_notes': {
      convo.data.notes = msgBody;
      await confirmAndSaveOrder(store, from, convoKey, convo);
      break;
    }

    default:
      conversations.delete(convoKey);
      await sendGreeting(store, from);
  }
}

async function confirmAndSaveOrder(store, from, convoKey, convo) {
  try {
    // Save order to database
    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        productId: convo.productId,
        customerName: convo.data.name,
        customerPhone: from,
        customerAddress: convo.data.address || null,
        scheduledTime: convo.data.scheduledTime || null,
        notes: convo.data.notes || null,
        status: 'pending',
        totalPrice: convo.productPrice,
      },
    });

    // Clear conversation state
    conversations.delete(convoKey);

    // Build confirmation message
    let msg = `🎉 *Pedido #${order.id} registrado com sucesso!*\n\n`;
    msg += `📦 *Produto:* ${convo.productName}\n`;
    msg += `💰 *Valor:* R$ ${convo.productPrice.toFixed(2).replace('.', ',')}\n`;
    msg += `👤 *Nome:* ${convo.data.name}\n`;
    if (convo.data.scheduledTime) msg += `🕐 *Horário:* ${convo.data.scheduledTime}\n`;
    if (convo.data.address) msg += `📍 *Endereço:* ${convo.data.address}\n`;
    if (convo.data.notes) msg += `💬 *Obs:* ${convo.data.notes}\n`;
    msg += `\n✅ Status: *Aguardando confirmação*\n`;
    msg += `\nO lojista verá seu pedido e entrará em contato para confirmar. Obrigado! 😊`;

    await sendWhatsAppMessage(store, from, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: msg },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'ver_catalogo', title: '📋 Ver Catálogo' } },
            { type: 'reply', reply: { id: 'ver_pedidos', title: '📄 Meus Pedidos' } },
          ],
        },
      },
    });
  } catch (error) {
    console.error('Error saving order:', error);
    conversations.delete(convoKey);
    await sendWhatsAppMessage(store, from, {
      type: 'text',
      text: { body: 'Desculpe, houve um erro ao registrar seu pedido. Tente novamente.' },
    });
  }
}

// ===== MENU FUNCTIONS =====

async function sendWhatsAppMessage(store, to, payload) {
  const url = `https://graph.facebook.com/v21.0/${store.botPhoneId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${store.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        ...payload,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('WhatsApp API error:', JSON.stringify(err));
    }
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error.message);
  }
}

async function sendGreeting(store, to) {
  const greeting = store.botGreeting || `Olá! 👋 Bem-vindo(a) à *${store.name}*!`;

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `${greeting}\n\nComo posso te ajudar?`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'ver_catalogo', title: '📋 Ver Catálogo' } },
          { type: 'reply', reply: { id: 'ver_todos', title: '📦 Todos Produtos' } },
          { type: 'reply', reply: { id: 'fazer_pedido', title: '🛒 Fazer Pedido' } },
        ],
      },
    },
  });
}

async function sendCatalogMenu(store, to) {
  const categories = store.categories;

  if (categories.length === 0) {
    await sendAllProducts(store, to);
    return;
  }

  const sections = [{
    title: 'Categorias',
    rows: categories.slice(0, 10).map(cat => ({
      id: `cat_${cat.id}`,
      title: cat.name.substring(0, 24),
      description: `Ver produtos de ${cat.name}`.substring(0, 72),
    })),
  }];

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: `📋 *Catálogo - ${store.name}*\n\nEscolha uma categoria para ver os produtos:`,
      },
      action: {
        button: 'Ver Categorias',
        sections,
      },
    },
  });
}

async function sendProductsForCategory(store, to, categoryId) {
  const products = store.products.filter(p => p.categoryId === categoryId);
  const category = store.categories.find(c => c.id === categoryId);
  const catName = category?.name || 'Categoria';

  if (products.length === 0) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: `Nenhum produto disponível em *${catName}* no momento.` },
    });
    return;
  }

  const sections = [{
    title: catName,
    rows: products.slice(0, 10).map(p => ({
      id: `prod_${p.id}`,
      title: p.name.substring(0, 24),
      description: `R$ ${p.price.toFixed(2).replace('.', ',')}`.substring(0, 72),
    })),
  }];

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: `📦 *${catName}*\n\nEscolha um produto para ver os detalhes:`,
      },
      action: {
        button: 'Ver Produtos',
        sections,
      },
    },
  });
}

async function sendAllProducts(store, to) {
  const products = store.products;

  if (products.length === 0) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: 'Nenhum produto disponível no momento. 😕' },
    });
    return;
  }

  let msg = `📦 *Todos os Produtos - ${store.name}*\n\n`;

  const grouped = {};
  products.forEach(p => {
    const catName = p.category?.name || 'Sem categoria';
    if (!grouped[catName]) grouped[catName] = [];
    grouped[catName].push(p);
  });

  Object.entries(grouped).forEach(([catName, prods]) => {
    msg += `*${catName}*\n`;
    prods.forEach(p => {
      msg += `  • ${p.name} — R$ ${p.price.toFixed(2).replace('.', ',')}\n`;
    });
    msg += '\n';
  });

  msg += `\n💬 Para fazer um pedido, envie *"pedido"* ou liste os itens que deseja!`;

  await sendWhatsAppMessage(store, to, {
    type: 'text',
    text: { body: msg },
  });
}

async function sendProductDetail(store, to, productId) {
  const product = store.products.find(p => p.id === productId);

  if (!product) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: 'Produto não encontrado.' },
    });
    return;
  }

  let msg = `📦 *${product.name}*\n\n`;
  if (product.description) msg += `${product.description}\n\n`;
  msg += `💰 *Preço: R$ ${product.price.toFixed(2).replace('.', ',')}*\n`;
  if (product.category) msg += `📁 Categoria: ${product.category.name}\n`;

  // Send product info with ORDER button
  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: msg },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `order_${product.id}`, title: '🛒 Pedir Este' } },
          { type: 'reply', reply: { id: 'ver_catalogo', title: '📋 Ver Catálogo' } },
        ],
      },
    },
  });
}

async function sendOrderInstructions(store, to) {
  // Show products as options to order
  const products = store.products;

  if (products.length === 0) {
    await sendWhatsAppMessage(store, to, {
      type: 'text',
      text: { body: 'Nenhum produto disponível para pedido no momento.' },
    });
    return;
  }

  const sections = [{
    title: 'Escolha um produto',
    rows: products.slice(0, 10).map(p => ({
      id: `order_${p.id}`,
      title: p.name.substring(0, 24),
      description: `R$ ${p.price.toFixed(2).replace('.', ',')}`.substring(0, 72),
    })),
  }];

  await sendWhatsAppMessage(store, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: `🛒 *Fazer Pedido*\n\nEscolha o produto ou serviço que deseja:`,
      },
      action: {
        button: 'Escolher Produto',
        sections,
      },
    },
  });
}

async function sendCustomerOrders(store, from) {
  try {
    const orders = await prisma.order.findMany({
      where: { storeId: store.id, customerPhone: from },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (orders.length === 0) {
      await sendWhatsAppMessage(store, from, {
        type: 'text',
        text: { body: 'Você não tem pedidos recentes. 📋' },
      });
      return;
    }

    let msg = `📄 *Seus Pedidos Recentes*\n\n`;
    const statusEmoji = { pending: '⏳', confirmed: '✅', completed: '🎉', cancelled: '❌' };
    const statusLabel = { pending: 'Aguardando', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado' };

    orders.forEach(o => {
      msg += `*#${o.id}* — ${o.product?.name || 'Produto removido'}\n`;
      msg += `  💰 R$ ${(o.totalPrice || 0).toFixed(2).replace('.', ',')}\n`;
      msg += `  ${statusEmoji[o.status] || '❓'} ${statusLabel[o.status] || o.status}\n`;
      if (o.scheduledTime) msg += `  🕐 ${o.scheduledTime}\n`;
      msg += `\n`;
    });

    await sendWhatsAppMessage(store, from, {
      type: 'text',
      text: { body: msg },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
  }
}

module.exports = router;
