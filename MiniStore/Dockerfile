FROM gcc:13

WORKDIR /app

COPY . .

RUN g++ -std=c++17 -pthread Source.cpp -o MiniStore

EXPOSE 8080

CMD ["./MiniStore"]
