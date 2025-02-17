// Telegram WebApp başlatma
const tg = window.Telegram.WebApp;

// WebApp'i hazırla
tg.ready();
tg.expand();

// API istekleri için yardımcı fonksiyon
async function fetchWithAuth(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tg.initData}`
        }
    };

    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(url, mergedOptions);
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Yetkilendirme hatası. Lütfen Telegram üzerinden tekrar deneyin.');
            }
            throw new Error('Sunucu hatası: ' + response.status);
        }
        return await response.json();
    } catch (error) {
        console.error('API Hatası:', error);
        throw error;
    }
}

// Bildirim fonksiyonları
function showNotification(message, isError = false) {
    const toast = document.getElementById('notificationToast');
    const toastBody = toast.querySelector('.toast-body');
    
    toast.classList.remove('text-bg-danger', 'text-bg-success');
    toast.classList.add(isError ? 'text-bg-danger' : 'text-bg-success');
    
    toastBody.textContent = message;
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Hata gösterme
function showError(message) {
    showNotification(message, true);
}

// Başarı mesajı
function showSuccess(message) {
    showNotification(message, false);
}

// Solana bağlantısı
const connection = new solanaWeb3.Connection(
    'https://api.devnet.solana.com',
    'confirmed'
);

let wallet = null;
let userInfo = null;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // WebApp hazır olana kadar bekle
        if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
            // Eğer test ortamındaysak
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                userInfo = {
                    id: 12345,
                    first_name: 'Test',
                    username: 'test_user'
                };
            } else {
                throw new Error('Bu uygulama sadece Telegram üzerinden kullanılabilir');
            }
        } else {
            userInfo = tg.initDataUnsafe.user;
        }

        // Kullanıcı bakiyesini getir
        await updateBalance();
        // Son işlemleri getir
        await loadTransactions();
    } catch (error) {
        showError(error.message || 'Bir hata oluştu');
    }
});

// Bakiye güncelleme
async function updateBalance() {
    try {
        const data = await fetchWithAuth('/api/balance');
        document.getElementById('userBalance').textContent = `${data.balance.toFixed(2)} USDC`;
    } catch (error) {
        showError(error.message || 'Bakiye güncellenirken hata oluştu');
    }
}

// Para yatırma arayüzünü göster
function showDepositUI() {
    document.getElementById('depositUI').style.display = 'block';
    document.getElementById('withdrawUI').style.display = 'none';
}

// Para çekme arayüzünü göster
function showWithdrawUI() {
    document.getElementById('withdrawUI').style.display = 'block';
    document.getElementById('depositUI').style.display = 'none';
}

// Cüzdan bağlantısı
async function connectWallet() {
    try {
        if (!window.solana || !window.solana.isPhantom) {
            throw new Error('Lütfen Phantom Wallet yükleyin');
        }

        wallet = window.solana;
        await wallet.connect();
        
        const amount = document.getElementById('depositAmount').value;
        if (!amount || amount < 1 || amount > 10000) {
            throw new Error('Geçerli bir miktar giriniz (1-10000 USDC)');
        }

        const data = await fetchWithAuth('/api/deposit/init', {
            method: 'POST',
            body: JSON.stringify({
                amount: parseFloat(amount),
                wallet_address: wallet.publicKey.toString()
            })
        });

        document.getElementById('depositAddress').textContent = data.deposit_address;
        generateQRCode(data.deposit_address);
        startTransactionPolling(data.tx_id);
    } catch (error) {
        showError(error.message);
    }
}

// Para çekme işlemi
async function initiateWithdraw() {
    try {
        const amount = document.getElementById('withdrawAmount').value;
        const address = document.getElementById('withdrawAddress').value;

        if (!amount || amount < 1) {
            throw new Error('Geçerli bir miktar giriniz');
        }

        if (!address) {
            throw new Error('Geçerli bir Solana adresi giriniz');
        }

        showLoading(true);

        const data = await fetchWithAuth('/api/withdraw', {
            method: 'POST',
            body: JSON.stringify({
                amount: parseFloat(amount),
                address: address
            })
        });

        if (data.success) {
            showSuccess('Para çekme talebi başarıyla oluşturuldu');
            await updateBalance();
            await loadTransactions();
        } else {
            throw new Error(data.message || 'Para çekme işlemi başarısız');
        }
    } catch (error) {
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

// QR Kod tarayıcı
function scanQRCode() {
    if (tg.showScanQrPopup) {
        tg.showScanQrPopup({
            text: 'QR kodu tarayın'
        }).then((text) => {
            document.getElementById('withdrawAddress').value = text;
        }).catch((error) => {
            showError('QR kod tarama başarısız: ' + error);
        });
    } else {
        showError('QR kod tarama bu platformda desteklenmiyor');
    }
}

// Son işlemleri yükle
async function loadTransactions() {
    try {
        const data = await fetchWithAuth('/api/transactions');
        const transactionsList = document.getElementById('transactionsList');
        transactionsList.innerHTML = '';

        if (!data.transactions || data.transactions.length === 0) {
            transactionsList.innerHTML = '<div class="text-muted">Henüz işlem bulunmuyor</div>';
            return;
        }

        data.transactions.forEach(tx => {
            const item = document.createElement('div');
            item.className = 'transaction-item';
            item.innerHTML = `
                <div>
                    <strong>${tx.type === 'deposit' ? 'Para Yatırma' : 'Para Çekme'}</strong>
                    <div class="text-muted">${new Date(tx.created_at).toLocaleString()}</div>
                </div>
                <div>
                    <strong>${tx.amount} USDC</strong>
                    <div class="text-muted">${tx.status}</div>
                </div>
            `;
            transactionsList.appendChild(item);
        });
    } catch (error) {
        showError(error.message || 'İşlem geçmişi yüklenemedi');
    }
}

// İşlem durumu takibi
function startTransactionPolling(txId) {
    const pollInterval = setInterval(async () => {
        try {
            const data = await fetchWithAuth(`/api/transaction/${txId}`);
            
            if (data.status === 'completed') {
                clearInterval(pollInterval);
                showSuccess('Para yatırma işlemi başarılı');
                await updateBalance();
                await loadTransactions();
            } else if (data.status === 'failed') {
                clearInterval(pollInterval);
                showError('Para yatırma işlemi başarısız');
            }
        } catch (error) {
            clearInterval(pollInterval);
            showError('İşlem durumu kontrol edilemedi');
        }
    }, 5000);
}

// QR Kod oluşturma
function generateQRCode(address) {
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: address,
        width: 128,
        height: 128
    });
}

// Yükleniyor göstergesi
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
} 