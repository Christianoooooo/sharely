FROM docker:29-cli

# The image ships `docker compose`; git is needed to pull the release;
# bash for the agent script. apk upgrade picks up Alpine security fixes released
# after the base image was built.
RUN apk upgrade --no-cache && apk add --no-cache bash git

COPY update-agent.sh /usr/local/bin/update-agent.sh
RUN chmod +x /usr/local/bin/update-agent.sh

ENTRYPOINT ["/usr/local/bin/update-agent.sh"]
