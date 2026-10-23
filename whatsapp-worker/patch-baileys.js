const fs = require('fs');
const path = require('path');

try {
  // 1. Patch signal.js
  const signalPath = path.join(__dirname, 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Utils', 'signal.js');
  if (fs.existsSync(signalPath)) {
    let signalCode = fs.readFileSync(signalPath, 'utf8');
    if (!signalCode.includes('const { user, server } = (0, WABinary_1.jidDecode)(id);')) {
      signalCode = signalCode.replace(
        'const { user } = (0, WABinary_1.jidDecode)(id);',
        'const { user, server } = (0, WABinary_1.jidDecode)(id);'
      );
      signalCode = signalCode.replace(
        'extracted.push({ user, device });',
        'extracted.push({ user, device, server });'
      );
      fs.writeFileSync(signalPath, signalCode, 'utf8');
      console.log('[patch-baileys] signal.js patched successfully.');
    }
  }

  // 2. Patch messages-send.js
  const msgSendPath = path.join(__dirname, 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-send.js');
  if (fs.existsSync(msgSendPath)) {
    let msgSendCode = fs.readFileSync(msgSendPath, 'utf8');
    
    // Catch per-participant encryption errors so a missing session doesn't fail the whole group message
    if (!msgSendCode.includes('Failed to encrypt participant node, skipping')) {
      const targetBlock = `        const nodes = await Promise.all(jids.map(async (jid) => {
            const { type, ciphertext } = await signalRepository
                .encryptMessage({ jid, data: bytes });
            if (type === 'pkmsg') {
                shouldIncludeDeviceIdentity = true;
            }
            const node = {
                tag: 'to',
                attrs: { jid },
                content: [{
                        tag: 'enc',
                        attrs: {
                            v: '2',
                            type,
                            ...extraAttrs || {}
                        },
                        content: ciphertext
                    }]
            };
            return node;
        }));`;

      const replacementBlock = `        const nodes = [];
        await Promise.all(jids.map(async (jid) => {
            try {
                const { type, ciphertext } = await signalRepository
                    .encryptMessage({ jid, data: bytes });
                if (type === 'pkmsg') {
                    shouldIncludeDeviceIdentity = true;
                }
                const node = {
                    tag: 'to',
                    attrs: { jid },
                    content: [{
                            tag: 'enc',
                            attrs: {
                                v: '2',
                                type,
                                ...extraAttrs || {}
                            },
                            content: ciphertext
                        }]
                };
                nodes.push(node);
            } catch (err) {
                logger.warn({ jid, err: err.message }, 'Failed to encrypt participant node, skipping');
            }
        }));`;

      if (msgSendCode.includes(targetBlock)) {
        msgSendCode = msgSendCode.replace(targetBlock, replacementBlock);
      }
    }

    // Preserve LID server in group dispatch
    msgSendCode = msgSendCode.replace(
      'devices.map(d => (0, WABinary_1.jidEncode)(d.user, isLid ? \'lid\' : \'s.whatsapp.net\', d.device))',
      'devices.map(d => (0, WABinary_1.jidEncode)(d.user, d.server || (isLid ? \'lid\' : \'s.whatsapp.net\'), d.device))'
    );
    msgSendCode = msgSendCode.replace(
      'for (const { user, device } of devices) {\n                    const jid = (0, WABinary_1.jidEncode)(user, isLid ? \'lid\' : \'s.whatsapp.net\', device);',
      'for (const { user, device, server: devServer } of devices) {\n                    const jid = (0, WABinary_1.jidEncode)(user, devServer || (isLid ? \'lid\' : \'s.whatsapp.net\'), device);'
    );

    fs.writeFileSync(msgSendPath, msgSendCode, 'utf8');
    console.log('[patch-baileys] messages-send.js patched successfully.');
  }
} catch (e) {
  console.warn('[patch-baileys] Error patching Baileys:', e.message);
}
