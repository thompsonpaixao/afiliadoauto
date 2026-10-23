async function testPdpEndpoints() {
  const shopid = 1604477523;
  const itemid = 58260793580;

  const endpoints = [
    `https://shopee.com.br/api/v4/pdp/get_pc?item_id=${itemid}&shop_id=${shopid}`,
    `https://shopee.com.br/api/v4/item/get?itemid=${itemid}&shopid=${shopid}`,
    `https://shopee.com.br/api/v2/item/get?itemid=${itemid}&shopid=${shopid}`,
  ];

  for (const ep of endpoints) {
    try {
      console.log('Testing endpoint:', ep);
      const res = await fetch(ep, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': `https://shopee.com.br/product/${shopid}/${itemid}`,
          'Accept': 'application/json',
          'x-api-source': 'pc',
        },
      });
      console.log('Status:', res.status);
      const text = await res.text();
      console.log('Response length:', text.length, 'Snippet:', text.slice(0, 200));
      if (text.includes('65') || text.includes('before_discount')) {
        console.log('FOUND 65 or before_discount in', ep);
        const json = JSON.parse(text);
        console.log('Keys:', Object.keys(json.data || {}));
        if (json.data?.item) {
          console.log('item keys:', Object.keys(json.data.item));
          console.log('price_before_discount:', json.data.item.price_before_discount);
          console.log('price:', json.data.item.price);
        }
      }
    } catch (e) {
      console.log('Err:', e.message);
    }
  }
}

testPdpEndpoints().catch(console.error);
