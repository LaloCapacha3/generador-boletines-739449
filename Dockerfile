# Dockerfile para generador-boletines
FROM node:16-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias y TypeScript globalmente
RUN npm ci && npm install -g typescript

# Crear directorio para archivos temporales
RUN mkdir -p /app/dist/temp && chmod -R 777 /app/dist/temp

# Copiar código fuente
COPY . .

# Asignar permisos y compilar TypeScript
RUN chmod -R 777 /app/node_modules/.bin/ && npx tsc

# Exponer puerto 3001 para el servicio generador
EXPOSE 3001

# Comando para iniciar el servicio
CMD ["node", "dist/index.js"]