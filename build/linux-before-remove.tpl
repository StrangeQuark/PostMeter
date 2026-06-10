#!/bin/bash

# Remove the alternative before FPM deletes /opt/PostMeter/postmeter.
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove 'postmeter' '/opt/PostMeter/postmeter' || true
else
    rm -f '/usr/bin/postmeter'
fi
