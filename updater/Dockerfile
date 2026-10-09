FROM docker:27-cli

# docker-cli-compose provides `docker compose`; git is needed to pull the release;
# bash for the agent script.
RUN apk add --no-cache bash git docker-cli-compose

COPY update-agent.sh /usr/local/bin/update-agent.sh
RUN chmod +x /usr/local/bin/update-agent.sh

ENTRYPOINT ["/usr/local/bin/update-agent.sh"]
