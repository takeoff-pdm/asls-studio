<template>
  <uk-flex
    tabindex="0"
    center-v
    class="navigation_header"
  >
    <uk-menu :menus="menus" />
    <uk-spacer />
    <p>{{ saveState ? "" : "*" }} {{ project }}</p>
    <uk-spacer />

    <uk-flex
      center-both
      class="bpm_container"
      @click="()=>{}"
    >
      <h3>BPM: </h3>
      <uk-num-input
        v-model="$show.bpm"
        style="margin-left:8px;width:60px;"
        @input="bpm=$show.bpm"
      />
      <div
        class="colored_dot"
        :style="{
          animationDuration: 60000 / bpm + 'ms',
          animationPlayState: state === 1 ? 'running' : 'paused'
        }"
      />
    </uk-flex>
    <uk-flex
      center-both
      class="state_container"
      @click="playPauseShow()"
    >
      <div
        class="play_state_icon"
        :class="liveState.text"
      />
      <h3>{{ liveState.text }}</h3>
    </uk-flex>
    <uk-flex
      center-both
      class="tap_container"
      @click="bpm = $show.tapTempo()"
    >
      <h3>TAP TEMPO</h3>
    </uk-flex>
    <uk-flex
      center-both
      class="dmx_receiver_container"
      @click="toggleDmxReceiver"
      :class="{ 
        'active': dmxReceiverVisible,
        'connected': dmxReceiverConnected
      }"
    >
      <span class="dmx_receiver_icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="14" viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="4" height="6" rx="1" fill="currentColor" fill-opacity="0.1"></rect>
          <rect x="18" y="12" width="4" height="6" rx="1" fill="currentColor" fill-opacity="0.1"></rect>
          <path d="M6 5 C 8 5, 10 8, 12 10 C 14 12, 16 15, 18 15"></path>
        </svg>
      </span>
      <h3>DMX IN</h3>
    </uk-flex>
    <visualizer-popup v-model="visualizerPopupState" />
    <license-popup v-model="licensePopupState" />
    <credits-popup v-model="creditsPopupState" />
    <newshow-popup v-model="newProjectPopupState" />
    <saveas-popup v-model="saveasPopupState" />
    <connections-popup v-model="connectionsPopupState" />
  </uk-flex>
</template>

<script>
import EventBus from '@/plugins/eventbus';
import VisualizerPopup from './_popups/popup.visualizer.vue';
import LicensePopup from './_popups/popup.license.vue';
import CreditsPopup from './_popups/popup.credits.vue';
import NewshowPopup from './_popups/popup.newshow.vue';
import SaveasPopup from './_popups/popup.saveas.vue';
import ConnectionsPopup from './_popups/popup.connections.vue';

export default {
  name: 'ToolbarFragment',
  compatConfig: {
    // or, for full vue 3 compat in this component:
    MODE: 3,
  },
  components: {
    VisualizerPopup,
    LicensePopup,
    CreditsPopup,
    NewshowPopup,
    SaveasPopup,
    ConnectionsPopup,
  },
  data() {
    return {
      /**
       * Current show project naem
       * @todo, change name/use show handle directly ?
       */
      project: this.$show.name,
      /**
       * Current show savestate
       */
      saveState: true,
      /**
       * CUrrent show bpm value
       */
      bpm: this.$show.bpm,
      /**
       * Current show state
       */
      state: this.$show.state,
      /**
       * Connection popup state
       */
      connectionsPopupState: false,
      /**
       * New project popup state
       */
      newProjectPopupState: false,
      /**
       * Visualizer popup state
       */
      visualizerPopupState: false,
      /**
       * License popup state
       */
      licensePopupState: false,
      /**
       * Credits popup state
       */
      creditsPopupState: false,
      /**
       * Save as popup state
       */
      saveasPopupState: false,
      /**
       * I/O popup state
       */
      bpmPopupState: false,
      /**
       * DMX Receiver visibility state
       */
      dmxReceiverVisible: localStorage.getItem('dmxReceiverVisible') === 'true',
      /**
       * DMX Receiver connection state
       */
      dmxReceiverConnected: false,
      /**
       * Toolbarmenu configuration object
       */
      menus: [
        {
          name: 'File',
          selected: false,
          items: [
            {
              name: 'New Showfile',
              icon: 'newfile',
              shortcut: 'Shift+N',
              callback: () => {
                this.displayNewProjectPopup();
              },
            },
            {
              name: 'Load Showfile',
              icon: 'folder',
              shortcut: 'Ctrl+O',
              callback: () => {
                this.loadFile();
              },
            },
            {
              name: 'Save Showfile Locally',
              shortcut: 'Ctrl+S',
              icon: 'save',
              callback: () => {
                this.saveLocal();
              },
            },
            {
              name: 'Export Showfile',
              shortcut: 'Ctrl+Shift+S',
              icon: 'export',
              callback: () => {
                this.saveasPopupState = true;
              },
            },
          ],
        },
        {
          name: 'Edit',
          selected: false,
          items: [
            {
              name: 'Undo',
              shortcut: 'Ctrl+Z',
              icon: 'undo',
              callback: () => {
                this.$show.undo();
              },
            },
            {
              name: 'Redo',
              shortcut: 'Ctrl+Y',
              icon: 'redo',
              callback: () => {
                this.$show.redo();
              },
            },
          ],
        },
        {
          name: 'Preferences',
          selected: false,
          items: [
            {
              name: 'Visualizer',
              shortcut: 'Ctrl+Shift+V',
              icon: 'visualizer',
              callback: () => {
                this.displayVisualizerPopup();
              },
            },
            {
              name: 'Outputs',
              shortcut: 'Ctrl+Shift+O',
              icon: 'zoom',
              callback: () => {
                this.connectionsPopupState = true;
              },
            },
            {
              name: 'DMX Receiver',
              shortcut: 'Alt+D',
              icon: 'network',
              callback: () => {
                this.toggleDmxReceiver();
              },
            },
          ],
        },
        {
          name: 'About',
          selected: false,
          items: [
            {
              name: 'Manual',
              icon: 'help',
              callback: () => {
                window.open('https://studio.asls.timekadel.com/', '_blank');
              },
            },
            {
              name: 'License',
              icon: 'key',
              callback: () => {
                this.displayLicensePopup();
              },
            },
            {
              name: 'Credits',
              icon: 'opensource',
              callback: () => {
                this.displayCreditsPopup();
              },
            },
            {
              name: 'Contact',
              icon: 'contact',
              callback: () => {
                window.open('https://github.com/timekadel', '_blank');
              },
            },
          ],
        },
      ],
    };
  },
  computed: {
    liveState() {
      switch (this.state) {
        case 0:
          return {
            text: 'stopped',
            color: 'red',
            icon: 'stop',
          };
        case 1:
          return {
            text: 'playing',
            color: 'green',
            icon: 'play',
          };
        case 2:
          return {
            text: 'paused',
            color: 'yellow',
            icon: 'pause',
          };
        default: break;
      }
      return {};
    },
  },
  mounted() {
    this.$show.on('saveState', (state) => {
      this.saveState = state;
    });
    EventBus.on('app_ready', () => {
      this.project = this.$show.name;
      window.removeEventListener('keydown', this.handleKeydownEvent);
      window.addEventListener('keydown', this.handleKeydownEvent);
    });
    
    // Set up key listener
    window.addEventListener('keydown', this.handleKeydownEvent);
    
    // Listen for changes to the dmxReceiverVisible state from the panel close button
    EventBus.on('dmx_receiver_state_changed', (visible) => {
      this.dmxReceiverVisible = visible;
    });
    
    // Listen for DMX connection state changes
    EventBus.on('dmx_connection_state_changed', (connected) => {
      this.dmxReceiverConnected = connected;
    });
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleKeydownEvent);
    EventBus.off('dmx_receiver_state_changed');
    EventBus.off('dmx_connection_state_changed');
  },
  methods: {
    /**
     * Toggle between show's play & pause states
     */
    playPauseShow() {
      if (this.$show.state !== 1) {
        this.$show.state = 1;
      } else {
        this.$show.state = 2;
      }
      this.state = this.$show.state;
    },
    /**
     * Set show in stop state
     */
    stopShow() {
      this.$show.state = 0;
      this.state = this.$show.state;
    },
    /**
     * Load showfile from native file loader
     *
     * @public
     * @async
     */
    async loadFile() {
      const el = document.createElement('input');
      el.type = 'file';
      el.accept = '.qxw,.asls,.json,';
      el.style.display = 'none';
      el.addEventListener('change', async () => {
        if (el.files) {
          try {
            this.$router.push('/');
            await this.$show.loadFromFile(el.files[0]);
            // Yeah it sucks... But cleaning up everything from the view was a nightmare so for now:
            window.location.reload();
          } catch (err) {
            EventBus.emit('app_error', err);
          }
        }
        document.body.removeChild(el);
      });
      document.body.appendChild(el);
      el.click();
    },
    /**
     * Persists showfile locally
     *
     * @public
     */
    saveLocal() {
      this.$show.persistLocally();
    },
    /**
     * Toggle DMX Receiver panel visibility
     */
    toggleDmxReceiver() {
      this.dmxReceiverVisible = !this.dmxReceiverVisible;
      // Just toggle visibility, don't affect the connection
      localStorage.setItem('dmxReceiverVisible', this.dmxReceiverVisible);
      EventBus.emit('toggle_dmx_receiver', this.dmxReceiverVisible);
    },
    /**
     * Keydown event handler
     *
     * @public
     * @param {Object} e keydown event
     */
    handleKeydownEvent(e) {
      switch (e.code) {
        case 'Space':
          this.playPauseShow();
          break;
        default: break;
      }
      
      // Alt+D to toggle DMX Receiver
      if (e.altKey && e.key === 'd') {
        this.toggleDmxReceiver();
        e.preventDefault();
      }
    },
    /**
     * Display visualizer popup
     *
     * @public
     */
    displayVisualizerPopup() {
      this.visualizerPopupState = true;
    },
    /**
     * Display new project popup
     *
     * @public
     */
    displayNewProjectPopup() {
      this.newProjectPopupState = true;
    },
    /**
     * Display license popup
     *
     * @public
     */
    displayLicensePopup() {
      this.licensePopupState = true;
    },
    /**
     * Display credits popup
     *
     * @public
     */
    displayCreditsPopup() {
      this.creditsPopupState = true;
    },
    /**
     * Display BPM popup
     *
     * @public
     */
    displayBPMPopup() {
      this.bpmPopupState = true;
    },
  },
};
</script>

<style scoped>
.navigation_header {
  min-height: 40px;
  width: 100%;
  background: var(--primary-light);
  border-bottom: 1px solid var(--primary-dark);
  z-index: 20;
}
.header_menu,
.bpm_container,
.tap_container,
.state_container,
.dmx_receiver_container {
  height: 100%;
  padding: 0 16px;
  border-left: 1px solid var(--primary-dark);
}
.state_container{
  width: 100px;
  min-width: 100px;
  max-width: 100px;
}
.tap_container:active, 
.state_container:active,
.dmx_receiver_container:active {
  background: var(--secondary-dark) !important;
}
.tap_container:hover, 
.state_container:hover,
.dmx_receiver_container:hover {
  background: var(--secondary-darker);
  cursor: pointer;
}
.colored_dot {
  height: 10px;
  width: 10px;
  border-radius: 50%;
  margin-left: 16px;
  animation-name: softblink;
  animation-iteration-count: infinite;
  animation-direction: alternate;
}
.play_state_icon {
  height: 10px;
  width: 10px;
  margin-right: 8px;
}
.play_state_icon.playing {
  background: transparent;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 10px solid var(--accent-sea-green);
}
.play_state_icon.stopped {
  background: #ce2d5e;
  border-radius: 2px;
}
.play_state_icon.paused {
  background-size: 10px;
  background:
    linear-gradient(
      90deg ,
      var(--accent-gold) 0px,
      var(--accent-gold) 3px,
      transparent 3px,
      transparent 7px,
      var(--accent-gold) 7px,
      var(--accent-gold) 10px
    );
}

@keyframes softblink {
  0% {
    background: var(--primary-light);
    border: 2px solid var(--accent-sea-green);
  }
  50% {
    background: transparent;
    border: 2px solid var(--accent-sea-green);
  }
  50% {
    background: var(--accent-sea-green);
    border: 2px solid transparent;
  }
  100% {
    background: var(--accent-sea-green);
    border: 2px solid transparent;
  }
}

.dmx_receiver_container {
  position: relative;
}

.dmx_receiver_container.active {
  background-color: var(--primary-lighter-alt);
}

.dmx_receiver_container.connected {
  border-left: 3px solid var(--accent-green);
}

.dmx_receiver_container.connected h3,
.dmx_receiver_container.connected .dmx_receiver_icon {
  color: var(--accent-green);
}

.dmx_receiver_icon {
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--secondary-light);
}

.dmx_receiver_container.connected .dmx_receiver_icon {
  color: var(--accent-green);
}
</style>
