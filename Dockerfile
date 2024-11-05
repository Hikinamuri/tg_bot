# Используем официальный образ Node.js
FROM node:18-alpine as installer

# Устанавливаем pnpm
RUN npm install -g pnpm@latest

# Устанавливаем рабочую директорию
WORKDIR /

# Копируем package.json и pnpm-lock.yaml для установки зависимостей
COPY package.json pnpm-lock.yaml ./

# Устанавливаем зависимости с использованием pnpm
RUN pnpm install

# Копируем остальную часть приложения
COPY . .

# Указываем команду запуска приложения
CMD ["node", "index.js"]
