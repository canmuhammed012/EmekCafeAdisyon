// Yazıcı yardımcı fonksiyonları
// ESC/POS formatında fiş yazdırma

export const formatReceipt = (receiptData) => {
  const { restaurantName, tableName, orders, total, date } = receiptData;
  
  let receipt = '\x1B\x40'; // Initialize printer
  receipt += '\x1B\x61\x01'; // Center align
  receipt += '\x1B\x21\x30'; // Double height and width
  receipt += `${restaurantName}\n`;
  receipt += '\x1B\x21\x00'; // Normal text
  receipt += '--------------------------------\n';
  receipt += `Masa: ${tableName}\n`;
  receipt += `Tarih: ${date}\n`;
  receipt += '--------------------------------\n';
  receipt += '\x1B\x61\x00'; // Left align
  
  orders.forEach((order) => {
    const line = `${order.name} x${order.quantity}`;
    const price = `${order.total.toFixed(2)} ₺`;
    const spaces = 32 - line.length - price.length;
    receipt += `${line}${' '.repeat(Math.max(0, spaces))}${price}\n`;
  });
  
  receipt += '--------------------------------\n';
  receipt += '\x1B\x61\x02'; // Right align
  receipt += `TOPLAM: ${total.toFixed(2)} ₺\n`;
  receipt += '\x1B\x61\x00'; // Left align
  receipt += '\n\n\n';
  receipt += '\x1D\x56\x00'; // Cut paper
  
  return receipt;
};

// Network yazıcı için (IP üzerinden)
export const printToNetworkPrinter = async (printerIP, receiptData) => {
  try {
    const receipt = formatReceipt(receiptData);
    // Burada network yazıcıya gönderme işlemi yapılacak
    // Örnek: socket veya HTTP isteği ile yazıcıya gönderilebilir
    console.log('Yazdırılıyor:', printerIP);
    console.log(receipt);
    
    // Gerçek implementasyon için yazıcı kütüphanesi kullanılabilir
    // Örnek: escpos-usb veya network printer library
    return true;
  } catch (error) {
    console.error('Yazdırma hatası:', error);
    return false;
  }
};

// USB yazıcı için
export const printToUSBPrinter = async (receiptData) => {
  try {
    const receipt = formatReceipt(receiptData);
    // USB yazıcı için implementasyon
    console.log('USB yazıcıya yazdırılıyor...');
    console.log(receipt);
    return true;
  } catch (error) {
    console.error('Yazdırma hatası:', error);
    return false;
  }
};

