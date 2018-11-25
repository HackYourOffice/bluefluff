FROM node:8

# https://stackoverflow.com/questions/24225647/docker-a-way-to-give-access-to-a-host-usb-or-serial-device/24231872#24231872

RUN apt-get update && apt-get install -y \
  libudev-dev

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

RUN setcap cap_net_raw+eip $(eval readlink -f `which node`)

COPY . .

EXPOSE 3872
CMD [ "npm", "start" ]