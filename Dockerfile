FROM node:16
WORKDIR /usr/src/app
COPY package*.json ./

RUN npm install
COPY . .

RUN npm run-script build

CMD ["npm", "start"]
