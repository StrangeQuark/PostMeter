#!/bin/bash

APPARMOR_PROFILE_DEST='/etc/apparmor.d/postmeter'

# Remove apparmor profile.
if [ -f "$APPARMOR_PROFILE_DEST" ]; then
  rm -f "$APPARMOR_PROFILE_DEST"
fi
