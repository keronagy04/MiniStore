// =========================================================
// MINISTORE - FRONTEND
// =========================================================

const $ = selector => document.querySelector(selector);

const currency = amount =>
    `EGP ${Number(amount || 0).toLocaleString('en-EG', {
        maximumFractionDigits: 2
    })}`;

let products = [];
let cart = [];

try {
    cart = JSON.parse(localStorage.getItem('ministore_cart') || '[]');
    if (!Array.isArray(cart)) cart = [];
} catch {
    cart = [];
}

let currentCategory = 'All';
let toastTimer;

// DOM
const grid = $('#productsGrid');
const cartPanel = $('#cartPanel');
const overlay = $('#overlay');
const checkoutModal = $('#checkoutModal');
const checkoutForm = $('#checkoutForm');

const cartCount = $('#cartCount');
const cartItems = $('#cartItems');
const cartTotal = $('#cartTotal');

const searchInput = $('#searchInput');
const sortSelect = $('#sortSelect');
const categoryButtons = document.querySelectorAll('.filter-btn');

const ordersList = $('#ordersList');
const checkoutSummary = $('#checkoutSummary');
const orderSuccess = $('#orderSuccess');

// =========================================================
// HELPERS
// =========================================================

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error('Invalid server response.');
    }

    if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
    }

    return data;
}

function toast(message, error = false) {
    const element = $('#toast');

    element.textContent = message;
    element.classList.toggle('error', error);
    element.classList.add('show');

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        element.classList.remove('show', 'error');
    }, 2800);
}

// =========================================================
// PRODUCTS / SEARCH / FILTER / SORT
// =========================================================

function getFilteredProducts() {
    const search = searchInput.value.trim().toLowerCase();

    let list = products.filter(product => {
        const categoryMatch =
            currentCategory === 'All' ||
            product.category === currentCategory;

        const text = [
            product.name,
            product.category,
            product.description
        ].join(' ').toLowerCase();

        return categoryMatch && text.includes(search);
    });

    switch (sortSelect.value) {
        case 'price-low':
            list.sort((a, b) => Number(a.price) - Number(b.price));
            break;

        case 'price-high':
            list.sort((a, b) => Number(b.price) - Number(a.price));
            break;

        case 'rating':
            list.sort((a, b) => Number(b.rating) - Number(a.rating));
            break;

        case 'name':
            list.sort((a, b) => a.name.localeCompare(b.name));
            break;
    }

    return list;
}

function renderProducts() {
    const list = getFilteredProducts();

    $('#resultsCount').textContent =
        `${list.length} product${list.length === 1 ? '' : 's'} found`;

    if (!list.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <h3>No products found</h3>
                <p>Try changing your search or filters.</p>
                <button class="btn btn-secondary" id="clearFiltersBtn">
                    Clear Filters
                </button>
            </div>
        `;

        $('#clearFiltersBtn').onclick = () => {
            searchInput.value = '';
            currentCategory = 'All';
            sortSelect.value = 'featured';

            categoryButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.category === 'All');
            });

            renderProducts();
        };

        return;
    }

    grid.innerHTML = list.map(product => `
        <article class="product-card">

            <div class="product-image-wrap"
                 data-details="${product.id}"
                 role="button"
                 tabindex="0">

                <img class="product-image"
                     src="${escapeHtml(product.image)}"
                     alt="${escapeHtml(product.name)}"
                     loading="lazy">

                <span class="product-badge">
                    ${escapeHtml(product.category)}
                </span>

                <button class="quick-view-btn"
                        data-details="${product.id}"
                        type="button">
                    Quick View
                </button>
            </div>

            <div class="product-info">
                <span class="product-category">
                    ${escapeHtml(product.category)}
                </span>

                <h3 class="product-title"
                    data-details="${product.id}">
                    ${escapeHtml(product.name)}
                </h3>

                <p class="product-description">
                    ${escapeHtml(product.description || '')}
                </p>

                <div class="product-rating">
                    <span class="rating-stars">★</span>
                    ${Number(product.rating || 0)}
                    <span class="review-count">
                        (${Number(product.reviews || 0)} reviews)
                    </span>
                </div>

                <div class="product-price-row">
                    <strong class="product-price">
                        ${currency(product.price)}
                    </strong>

                    ${product.oldPrice ? `
                        <span class="product-old-price">
                            ${currency(product.oldPrice)}
                        </span>
                    ` : ''}
                </div>

                <button class="product-add-btn"
                        data-add="${product.id}">
                    Add to Cart +
                </button>
            </div>
        </article>
    `).join('');

    grid.querySelectorAll('[data-add]').forEach(button => {
        button.onclick = event => {
            event.stopPropagation();
            addToCart(Number(button.dataset.add));
        };
    });

    grid.querySelectorAll('[data-details]').forEach(element => {
        element.onclick = () => {
            openProductDetails(Number(element.dataset.details));
        };

        element.onkeydown = event => {
            if (event.key === 'Enter') {
                openProductDetails(Number(element.dataset.details));
            }
        };
    });
}

searchInput.addEventListener('input', renderProducts);
sortSelect.addEventListener('change', renderProducts);

categoryButtons.forEach(button => {
    button.addEventListener('click', () => {
        categoryButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        currentCategory = button.dataset.category;
        renderProducts();
    });
});

// =========================================================
// PRODUCT DETAILS
// =========================================================

function openProductDetails(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    $('#productModalContent').innerHTML = `
        <button class="close-button product-modal-close"
                id="closeProductModal">×</button>

        <div class="product-details-layout">
            <div class="product-details-image">
                <img src="${escapeHtml(product.image)}"
                     alt="${escapeHtml(product.name)}">
            </div>

            <div class="product-details-info">
                <span class="section-label">
                    ${escapeHtml(product.category)}
                </span>

                <h2>${escapeHtml(product.name)}</h2>

                <div class="product-rating">
                    <span class="rating-stars">★</span>
                    ${Number(product.rating || 0)}
                    <span class="review-count">
                        (${Number(product.reviews || 0)} reviews)
                    </span>
                </div>

                <div class="details-price">
                    ${currency(product.price)}
                </div>

                ${product.oldPrice ? `
                    <div class="product-old-price">
                        ${currency(product.oldPrice)}
                    </div>
                ` : ''}

                <p class="details-description">
                    ${escapeHtml(product.description || '')}
                </p>

                <div class="details-feature">
                    <span>✓</span> Quality product
                </div>
                <div class="details-feature">
                    <span>✓</span> Easy checkout
                </div>

                <button class="btn btn-primary btn-block"
                        id="detailsAddToCart">
                    Add to Cart
                </button>
            </div>
        </div>
    `;

    $('#productModal').classList.add('active');
    document.body.classList.add('no-scroll');

    $('#closeProductModal').onclick = closeProductDetails;

    $('#detailsAddToCart').onclick = () => {
        addToCart(product.id);
        closeProductDetails();
    };
}

function closeProductDetails() {
    $('#productModal').classList.remove('active');

    if (!cartPanel.classList.contains('active') &&
        !checkoutModal.classList.contains('active')) {
        document.body.classList.remove('no-scroll');
    }
}

$('#productModalBackdrop').onclick = closeProductDetails;

// =========================================================
// CART
// =========================================================

function saveCart() {
    localStorage.setItem('ministore_cart', JSON.stringify(cart));
    renderCart();
}

function addToCart(id) {
    const product = products.find(p => p.id === id);

    if (!product) {
        toast('Product not found.', true);
        return;
    }

    let item = cart.find(x => x.productId === id);

    if (item) {
        if (item.quantity >= 100) {
            toast('Maximum quantity reached.', true);
            return;
        }

        item.quantity++;
    } else {
        cart.push({
            productId: id,
            quantity: 1
        });
    }

    saveCart();
    toast(`${product.name} added to cart.`);
}

function cartQuantity() {
    return cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function cartSubtotal() {
    return cart.reduce((sum, item) => {
        const product = products.find(p => p.id === item.productId);
        return sum + (product ? product.price * item.quantity : 0);
    }, 0);
}

function renderCart() {
    cartCount.textContent = cartQuantity();
    cartTotal.textContent = currency(cartSubtotal());

    if (!cart.length) {
        cartItems.innerHTML = `
            <div class="cart-empty">
                <div class="empty-icon">🛒</div>
                <h3>Your cart is empty</h3>
                <p>Add products to get started.</p>
            </div>
        `;
        return;
    }

    cartItems.innerHTML = cart.map(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return '';

        return `
            <div class="cart-item">
                <img class="cart-item-image"
                     src="${escapeHtml(product.image)}"
                     alt="${escapeHtml(product.name)}">

                <div class="cart-item-info">
                    <h3>${escapeHtml(product.name)}</h3>
                    <div class="cart-item-price">${currency(product.price)}</div>

                    <div class="cart-item-actions">
                        <button class="quantity-btn"
                                data-minus="${product.id}">−</button>
                        <span class="quantity-value">${item.quantity}</span>
                        <button class="quantity-btn"
                                data-plus="${product.id}">+</button>
                    </div>
                </div>

                <button class="remove-item"
                        data-remove="${product.id}">
                    Remove
                </button>
            </div>
        `;
    }).join('');

    cartItems.querySelectorAll('[data-plus]').forEach(button => {
        button.onclick = () => {
            const item = cart.find(x => x.productId === Number(button.dataset.plus));
            if (!item) return;

            if (item.quantity >= 100) {
                toast('Maximum quantity reached.', true);
                return;
            }

            item.quantity++;
            saveCart();
        };
    });

    cartItems.querySelectorAll('[data-minus]').forEach(button => {
        button.onclick = () => {
            const id = Number(button.dataset.minus);
            const item = cart.find(x => x.productId === id);
            if (!item) return;

            item.quantity--;

            if (item.quantity <= 0) {
                cart = cart.filter(x => x.productId !== id);
            }

            saveCart();
        };
    });

    cartItems.querySelectorAll('[data-remove]').forEach(button => {
        button.onclick = () => {
            cart = cart.filter(x => x.productId !== Number(button.dataset.remove));
            saveCart();
        };
    });
}

// =========================================================
// OVERLAYS
// =========================================================

function showOverlay() {
    overlay.classList.add('active');
    document.body.classList.add('no-scroll');
}

function hideOverlay() {
    overlay.classList.remove('active');
    cartPanel.classList.remove('active');
    checkoutModal.classList.remove('active');
    document.body.classList.remove('no-scroll');

    checkoutForm.style.display = '';
    orderSuccess.style.display = 'none';
}

function openCart() {
    renderCart();
    showOverlay();
    cartPanel.classList.add('active');
}

function closeCart() {
    cartPanel.classList.remove('active');

    if (!checkoutModal.classList.contains('active')) {
        overlay.classList.remove('active');
        document.body.classList.remove('no-scroll');
    }
}

$('#openCartBtn').onclick = openCart;
$('#closeCartBtn').onclick = closeCart;
$('#continueShoppingBtn').onclick = hideOverlay;
overlay.onclick = hideOverlay;

// =========================================================
// CHECKOUT
// =========================================================

function renderCheckoutSummary() {
    checkoutSummary.innerHTML = `
        <h3>Order Summary</h3>

        ${cart.map(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return '';

        return `
                <div class="checkout-summary-row">
                    <span>${escapeHtml(product.name)} × ${item.quantity}</span>
                    <strong>${currency(product.price * item.quantity)}</strong>
                </div>
            `;
    }).join('')}

        <div class="checkout-summary-row checkout-summary-total">
            <span>Total</span>
            <strong>${currency(cartSubtotal())}</strong>
        </div>
    `;
}

function openCheckout() {
    if (!cart.length) {
        toast('Your cart is empty.');
        return;
    }

    cartPanel.classList.remove('active');
    checkoutModal.classList.add('active');

    checkoutForm.style.display = '';
    orderSuccess.style.display = 'none';

    renderCheckoutSummary();
    showOverlay();
}

$('#checkoutBtn').onclick = openCheckout;
$('#closeCheckoutBtn').onclick = hideOverlay;

async function submitOrder(event) {
    event.preventDefault();

    if (!cart.length) {
        toast('Your cart is empty.');
        return;
    }

    const formData = new FormData(checkoutForm);

    const payload = {
        customerName: String(formData.get('customerName') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        address: String(formData.get('address') || '').trim(),
        notes: String(formData.get('notes') || '').trim(),
        items: cart.map(item => ({
            productId: item.productId,
            quantity: item.quantity
        }))
    };

    const button = $('#confirmOrderBtn');
    button.disabled = true;
    button.textContent = 'Submitting...';

    try {
        const data = await fetchJson('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!data.success || !data.order) {
            throw new Error(data.message || 'Order failed.');
        }

        cart = [];
        saveCart();
        checkoutForm.reset();
        checkoutForm.style.display = 'none';

        orderSuccess.style.display = 'block';
        orderSuccess.innerHTML = `
            <div class="order-success">
                <div class="success-icon">✓</div>
                <h2>Order Placed!</h2>
                <p>Thank you for shopping with MiniStore.</p>
                <div class="order-number">
                    Order ID: ${escapeHtml(data.order.id)}
                </div>
                <h3>${currency(data.order.total)}</h3>
                <button class="btn btn-primary btn-block"
                        id="successContinueBtn">
                    Continue Shopping
                </button>
                <button class="btn btn-secondary btn-block"
                        id="successOrdersBtn">
                    View My Orders
                </button>
            </div>
        `;

        $('#successContinueBtn').onclick = hideOverlay;
        $('#successOrdersBtn').onclick = () => {
            hideOverlay();
            $('#ordersSection').scrollIntoView({ behavior: 'smooth' });
            loadOrders();
        };

        toast('Order placed successfully!');
        loadOrders();

    } catch (error) {
        toast(error.message || 'Could not submit order.', true);
    } finally {
        button.disabled = false;
        button.textContent = 'Confirm Order';
    }
}

checkoutForm.addEventListener('submit', submitOrder);

// =========================================================
// ORDERS
// =========================================================

async function loadOrders() {
    ordersList.innerHTML = '<div class="loading">Loading orders...</div>';

    try {
        const orders = await fetchJson('/api/orders');

        if (!Array.isArray(orders) || orders.length === 0) {
            ordersList.innerHTML = `
                <div class="empty-state">
                    <h3>No orders yet</h3>
                    <p>Your purchases will appear here.</p>
                </div>
            `;
            return;
        }

        ordersList.innerHTML = [...orders].reverse().map(order => `
            <article class="order-card">
                <div class="order-card-header">
                    <strong>${escapeHtml(order.id)}</strong>
                    <span class="order-status">${escapeHtml(order.status || 'pending')}</span>
                </div>

                <p class="order-details">${escapeHtml(order.createdAt || '')}</p>

                <p class="order-details">
                    ${(order.items || []).map(item =>
            `${escapeHtml(item.name)} × ${Number(item.quantity || 0)}`
        ).join(' · ')}
                </p>

                <button class="btn btn-secondary order-details-toggle"
                        data-order-details="${escapeHtml(order.id)}">
                    View Details
                </button>

                <div class="order-full-details" id="details-${escapeHtml(order.id)}">
                    <p><strong>Customer:</strong> ${escapeHtml(order.customerName || '—')}</p>
                    <p><strong>Phone:</strong> ${escapeHtml(order.phone || '—')}</p>
                    <p><strong>Email:</strong> ${escapeHtml(order.email || '—')}</p>
                    <p><strong>Address:</strong> ${escapeHtml(order.address || '—')}</p>
                    <p><strong>Notes:</strong> ${escapeHtml(order.notes || '—')}</p>

                    <h4>Items</h4>

                    ${(order.items || []).map(item => `
                        <div class="order-item-row">
                            <span>${escapeHtml(item.name)} × ${Number(item.quantity || 0)}</span>
                            <strong>${currency(item.subtotal ?? (item.price * item.quantity))}</strong>
                        </div>
                    `).join('')}
                </div>

                <div class="cart-total-row order-total-row">
                    <span>Total</span>
                    <strong>${currency(order.total)}</strong>
                </div>
            </article>
        `).join('');

        ordersList.querySelectorAll('[data-order-details]').forEach(button => {
            button.onclick = () => {
                const id = button.dataset.orderDetails;
                const panel = document.getElementById(`details-${id}`);

                if (!panel) return;

                panel.classList.toggle('open');

                button.textContent = panel.classList.contains('open')
                    ? 'Hide Details'
                    : 'View Details';
            };
        });

    } catch {
        ordersList.innerHTML = `
            <div class="empty-state">
                <h3>Could not load orders</h3>
                <p>Make sure the server is running.</p>
            </div>
        `;
    }
}

$('#refreshOrdersBtn').onclick = loadOrders;

// =========================================================
// INIT
// =========================================================

async function init() {
    renderCart();

    try {
        products = await fetchJson('/api/products');
        renderProducts();
        renderCart();
    } catch {
        grid.innerHTML = `
            <div class="empty-state">
                <h3>Could not load products</h3>
                <p>Check that MiniStore is running.</p>
            </div>
        `;
    }

    loadOrders();
}

init();