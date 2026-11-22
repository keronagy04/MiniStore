#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <regex>
#include <mutex>
#include <ctime>
#include <iomanip>
#include <cmath>
#include <cctype>
#include <chrono>

#include "httplib.h"

using namespace std;
using namespace httplib;

const int SERVER_PORT = 8080;
const string ORDERS_FILE = "orders.json";

mutex ordersMutex;

struct Product {
    int id;
    string name;
    double price;
};

const vector<Product> products = {
    {1, "Wireless Headphones", 1499},
    {2, "Smart Watch", 2299},
    {3, "Classic Backpack", 899},
    {4, "Minimalist Watch", 1199},
    {5, "Wireless Speaker", 999},
    {6, "Sunglasses", 599},
    {7, "Mechanical Keyboard", 1799},
    {8, "Everyday Wallet", 399}
};

const string productsJson = R"JSON(
[
    {
        "id":1,
        "name":"Wireless Headphones",
        "category":"Electronics",
        "price":1499,
        "oldPrice":1899,
        "rating":4.8,
        "reviews":124,
        "image":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=85",
        "description":"Premium wireless headphones with amazing sound quality."
    },
    {
        "id":2,
        "name":"Smart Watch",
        "category":"Electronics",
        "price":2299,
        "oldPrice":2799,
        "rating":4.6,
        "reviews":86,
        "image":"https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=85",
        "description":"Track your activity and stay connected."
    },
    {
        "id":3,
        "name":"Classic Backpack",
        "category":"Accessories",
        "price":899,
        "oldPrice":1099,
        "rating":4.7,
        "reviews":59,
        "image":"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=700&q=85",
        "description":"A stylish backpack for everyday use."
    },
    {
        "id":4,
        "name":"Minimalist Watch",
        "category":"Accessories",
        "price":1199,
        "oldPrice":1499,
        "rating":4.5,
        "reviews":72,
        "image":"https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=700&q=85",
        "description":"Elegant design that fits every occasion."
    },
    {
        "id":5,
        "name":"Wireless Speaker",
        "category":"Electronics",
        "price":999,
        "oldPrice":1299,
        "rating":4.9,
        "reviews":201,
        "image":"https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=700&q=85",
        "description":"Portable speaker with rich, powerful sound."
    },
    {
        "id":6,
        "name":"Sunglasses",
        "category":"Accessories",
        "price":599,
        "oldPrice":799,
        "rating":4.4,
        "reviews":43,
        "image":"https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=700&q=85",
        "description":"Modern sunglasses with a timeless look."
    },
    {
        "id":7,
        "name":"Mechanical Keyboard",
        "category":"Electronics",
        "price":1799,
        "oldPrice":2199,
        "rating":4.8,
        "reviews":95,
        "image":"https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=700&q=85",
        "description":"Comfortable mechanical keyboard for work and gaming."
    },
    {
        "id":8,
        "name":"Everyday Wallet",
        "category":"Accessories",
        "price":399,
        "oldPrice":549,
        "rating":4.3,
        "reviews":31,
        "image":"https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=700&q=85",
        "description":"Compact wallet with a clean, practical design."
    }
]
)JSON";

// =========================================================
// FILE HELPERS
// =========================================================

string readFile(const string& path) {
    ifstream file(path, ios::binary);

    if (!file.is_open()) {
        return "";
    }

    stringstream buffer;
    buffer << file.rdbuf();

    return buffer.str();
}

void serveFile(Response& res, const string& path, const string& type) {
    string content = readFile(path);

    if (content.empty()) {
        res.status = 404;
        res.set_content("File not found: " + path, "text/plain");
        return;
    }

    res.set_content(content, type);
}

// =========================================================
// JSON HELPERS
// =========================================================

string escapeJson(const string& value) {
    string output;

    for (unsigned char c : value) {
        switch (c) {
        case '"':  output += "\\\""; break;
        case '\\': output += "\\\\"; break;
        case '\n': output += "\\n"; break;
        case '\r': output += "\\r"; break;
        case '\t': output += "\\t"; break;

        default:
            if (c >= 32) output += char(c);
        }
    }

    return output;
}

string jsonString(const string& value) {
    return "\"" + escapeJson(value) + "\"";
}

string jsonNumber(double value) {
    ostringstream output;
    output << fixed << setprecision(2) << value;
    return output.str();
}

string errorJson(const string& message) {
    return "{\"success\":false,\"message\":" + jsonString(message) + "}";
}

string getString(const string& body, const string& key) {
    regex pattern("\"" + key + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    smatch match;

    if (regex_search(body, match, pattern)) {
        return match[1].str();
    }

    return "";
}

bool getNumber(const string& body, const string& key, double& value) {
    regex pattern("\"" + key + "\"\\s*:\\s*(-?[0-9]+(?:\\.[0-9]+)?)");
    smatch match;

    if (!regex_search(body, match, pattern)) {
        return false;
    }

    try {
        value = stod(match[1].str());
        return isfinite(value);
    }
    catch (...) {
        return false;
    }
}

// Extract the items array safely enough for our supported order payload.
string extractItems(const string& body) {
    regex pattern("\"items\"\\s*:\\s*\\[");
    smatch match;

    if (!regex_search(body, match, pattern)) {
        return "";
    }

    size_t start = match.position() + match.length();

    int depth = 1;
    bool inString = false;
    bool escaped = false;

    for (size_t i = start; i < body.size(); i++) {
        char c = body[i];

        if (inString) {
            if (escaped) escaped = false;
            else if (c == '\\') escaped = true;
            else if (c == '"') inString = false;

            continue;
        }

        if (c == '"') {
            inString = true;
        }
        else if (c == '[') {
            depth++;
        }
        else if (c == ']') {
            depth--;

            if (depth == 0) {
                return body.substr(start, i - start);
            }
        }
    }

    return "";
}

// =========================================================
// DATE / ORDER ID
// =========================================================

string dateTime() {
    time_t now = time(nullptr);
    tm local{};

#ifdef _WIN32
    localtime_s(&local, &now);
#else
    localtime_r(&now, &local);
#endif

    ostringstream output;
    output << put_time(&local, "%Y-%m-%d %H:%M:%S");

    return output.str();
}

string orderId() {
    auto now = chrono::system_clock::now();

    auto milliseconds =
        chrono::duration_cast<chrono::milliseconds>(
            now.time_since_epoch()
            ).count();

    time_t seconds = chrono::system_clock::to_time_t(now);
    tm local{};

#ifdef _WIN32
    localtime_s(&local, &seconds);
#else
    localtime_r(&seconds, &local);
#endif

    ostringstream output;

    output << "ORD-"
        << put_time(&local, "%Y%m%d-%H%M%S")
        << "-"
        << milliseconds % 1000;

    return output.str();
}

// =========================================================
// PRODUCT HELPERS
// =========================================================

const Product* findProduct(int id) {
    for (const auto& product : products) {
        if (product.id == id) return &product;
    }

    return nullptr;
}

// =========================================================
// ORDER STORAGE
// =========================================================

bool saveOrder(const string& newOrder) {
    lock_guard<mutex> lock(ordersMutex);

    string oldOrders = readFile(ORDERS_FILE);

    if (oldOrders.empty()) oldOrders = "[]";

    while (!oldOrders.empty() &&
        isspace(static_cast<unsigned char>(oldOrders.back()))) {
        oldOrders.pop_back();
    }

    if (oldOrders.empty() || oldOrders.back() != ']') {
        return false;
    }

    if (oldOrders == "[]") {
        oldOrders = "[" + newOrder + "]";
    }
    else {
        oldOrders.pop_back();
        oldOrders += "," + newOrder + "]";
    }

    ofstream file(ORDERS_FILE, ios::binary | ios::trunc);

    if (!file.is_open()) return false;

    file << oldOrders;

    return file.good();
}

string getOrders() {
    lock_guard<mutex> lock(ordersMutex);

    string content = readFile(ORDERS_FILE);

    return content.empty() ? "[]" : content;
}

// =========================================================
// CREATE ORDER
// =========================================================

void postOrder(const Request& req, Response& res) {
    string customerName = getString(req.body, "customerName");
    string phone = getString(req.body, "phone");
    string email = getString(req.body, "email");
    string address = getString(req.body, "address");
    string notes = getString(req.body, "notes");

    if (customerName.empty() || phone.empty() || address.empty()) {
        res.status = 400;
        res.set_content(
            errorJson("Name, phone and address are required."),
            "application/json"
        );
        return;
    }

    string itemsArray = extractItems(req.body);

    if (itemsArray.empty()) {
        res.status = 400;
        res.set_content(errorJson("Cart is empty."), "application/json");
        return;
    }

    regex objectPattern("\\{[^{}]*\\}");

    auto begin = sregex_iterator(
        itemsArray.begin(),
        itemsArray.end(),
        objectPattern
    );

    auto end = sregex_iterator();

    double total = 0;
    int itemCount = 0;
    ostringstream orderItems;

    for (auto it = begin; it != end; ++it) {
        string item = it->str();

        double productId = 0;
        double quantity = 0;

        if (!getNumber(item, "productId", productId) ||
            !getNumber(item, "quantity", quantity) ||
            productId < 1 ||
            floor(productId) != productId ||
            quantity < 1 ||
            quantity > 100 ||
            floor(quantity) != quantity) {

            res.status = 400;
            res.set_content(errorJson("Invalid product or quantity."), "application/json");
            return;
        }

        const Product* product = findProduct((int)productId);

        if (!product) {
            res.status = 400;
            res.set_content(errorJson("Unknown product."), "application/json");
            return;
        }

        double subtotal = product->price * quantity;
        total += subtotal;

        if (itemCount > 0) orderItems << ",";

        orderItems
            << "{"
            << "\"productId\":" << product->id << ","
            << "\"name\":" << jsonString(product->name) << ","
            << "\"quantity\":" << (int)quantity << ","
            << "\"price\":" << jsonNumber(product->price) << ","
            << "\"subtotal\":" << jsonNumber(subtotal)
            << "}";

        itemCount++;
    }

    if (itemCount == 0) {
        res.status = 400;
        res.set_content(errorJson("Cart is empty."), "application/json");
        return;
    }

    string id = orderId();
    string createdAt = dateTime();

    string order =
        "{"
        "\"id\":" + jsonString(id) + ","
        "\"customerName\":" + jsonString(customerName) + ","
        "\"phone\":" + jsonString(phone) + ","
        "\"email\":" + jsonString(email) + ","
        "\"address\":" + jsonString(address) + ","
        "\"notes\":" + jsonString(notes) + ","
        "\"status\":\"pending\","
        "\"createdAt\":" + jsonString(createdAt) + ","
        "\"total\":" + jsonNumber(total) + ","
        "\"items\":[" + orderItems.str() + "]"
        "}";

    if (!saveOrder(order)) {
        res.status = 500;
        res.set_content(
            errorJson("Could not save order. Check server folder permissions."),
            "application/json"
        );
        return;
    }

    res.status = 201;

    res.set_content(
        "{\"success\":true,\"message\":\"Order created\",\"order\":" + order + "}",
        "application/json"
    );
}

// =========================================================
// MAIN
// =========================================================

int main() {
    Server server;

    // FRONTEND
    server.Get("/", [](const Request&, Response& res) {
        serveFile(res, "index.htm", "text/html");
        });

    server.Get("/style.css", [](const Request&, Response& res) {
        serveFile(res, "Style.css", "text/css");
        });

    server.Get("/script.js", [](const Request&, Response& res) {
        serveFile(res, "script.js", "application/javascript");
        });

    // PRODUCTS
    server.Get("/api/products", [](const Request&, Response& res) {
        res.set_content(productsJson, "application/json");
        });

    // STATUS
    server.Get("/api/status", [](const Request&, Response& res) {
        res.set_content(
            "{\"status\":\"success\",\"message\":\"MiniStore Backend is running\"}",
            "application/json"
        );
        });

    // ORDERS
    server.Post("/api/orders", postOrder);

    server.Get("/api/orders", [](const Request&, Response& res) {
        res.set_content(getOrders(), "application/json");
        });

    // LOGGING
    server.set_logger([](const Request& req, const Response& res) {
        cout << req.method << " " << req.path
            << " -> " << res.status << endl;
        });

    cout << "==================================\n";
    cout << "         MINI STORE SERVER         \n";
    cout << "==================================\n";
    cout << "Website: http://localhost:8080\n";
    cout << "Products: http://localhost:8080/api/products\n";
    cout << "Orders: http://localhost:8080/api/orders\n";
    cout << "Status: http://localhost:8080/api/status\n";
    cout << "Press Ctrl+C to stop.\n\n";

    if (!server.listen("127.0.0.1", SERVER_PORT)) {
        cerr << "Server failed to start. Port 8080 may be busy.\n";
        return 1;
    }

    return 0;
}