<template>
  <uk-flex
    col
    class="app_activity"
  >
    <toolbar />
    
    <div v-show="ready" class="dmx-receiver-panel" :class="{'hidden': !dmxReceiverVisible}">
      <button class="close-button" @click="toggleDmxReceiverPanel(false)">×</button>
      <keep-alive>
        <dmx-receiver ref="dmxReceiver" />
      </keep-alive>
    </div>
    
    <uk-flex class="top_fragments">
      <uk-flex class="top_fragment_left">
        <patch-bay />
        <group-pool />
      </uk-flex>
      <visualizer />
    </uk-flex>
    <modifier />
    <popup-splash
      v-model="loader.state"
      :loader="loader"
    />
    <error-popup
      v-model="errPopup.state"
      style="z-index: 1000"
      :error="errPopup.error"
    />
  </uk-flex>
</template>

<script>
import EventBus from '@/plugins/eventbus';

import Toolbar from './fragments/toolbar/toolbar.fragment.vue';
import PatchBay from './fragments/patch-bay/patch-bay.fragment.vue';
import GroupPool from './fragments/group-pool/group-pool.fragment.vue';
import Visualizer from './fragments/visualizer/visualizer.fragment.vue';
import Modifier from './fragments/modifiers/modifier.fragment.vue';
import DmxReceiver from './fragments/DmxReceiver.vue';

import PopupSplash from './_popups/popup.splash.vue';
import ErrorPopup from './_popups/popup.error.vue';

export default {
  name: 'AppActivity',
  compatConfig: {
    // or, for full vue 3 compat in this component:
    MODE: 3,
  },
  components: {
    Toolbar,
    PatchBay,
    GroupPool,
    Visualizer,
    Modifier,
    DmxReceiver,
    PopupSplash,
    ErrorPopup,
  },
  data() {
    return {
      /**
       * Error popup description object
       */
      errPopup: {
        error: new Error(),
        state: false,
      },
      /**
       * App readyness state
       */
      ready: false,
      /**
       * App loading state
       */
      loading: true,
      /**
       * Handle to show loading property
       */
      loader: this.$show.loading,
      /**
       * DMX Receiver panel visibility state
       */
      dmxReceiverVisible: localStorage.getItem('dmxReceiverVisible') === 'true',
    };
  },
  watch: {
    '$show.loading': {
      deep: true,
      handler(value) {
        this.loader = value;
      },
    },
    dmxReceiverVisible(value) {
      localStorage.setItem('dmxReceiverVisible', value.toString());
    }
  },
  async mounted() {
    this.$router._appReayState = false;
    EventBus.on('visualizer_loaded', this.setup);
    EventBus.on('app_error', (err) => {
      this.loader.message = 'An error occured while loading the app...';
      this.errPopup.error = err;
      this.errPopup.state = true;
    });
    
    // Listen for DMX Receiver toggle events
    EventBus.on('toggle_dmx_receiver', (visible) => {
      this.dmxReceiverVisible = visible;
    });
  },
  beforeUnmount() {
    EventBus.off('toggle_dmx_receiver');
  },
  methods: {
    /**
     * Setup App. Loads show from local storage or creates new
     * show project if no local data is available
     *
     * @public
     */
    async setup() {
      const localLoadingSucceeded = await this.$show.loadFromLocalStorage();

      if (!localLoadingSucceeded) {
        const res = await fetch('/demo/showfiles/demo.showfile.json');
        const showData = await res.json();
        await this.$show.loadFromData(showData);
      }

      await this.$router.push('/universe/0');
      this.loader = {
        message: 'Waiting for views to settle',
        percentage: 90,
        state: true,
      };

      await new Promise((r) => { setTimeout(r, 500); });
      this.loader.state = false;
      this.$router._appReayState = true;
      this.ready = true;
      EventBus.emit('app_ready');
    },
    toggleDmxReceiverPanel(visible) {
      this.dmxReceiverVisible = visible;
      // Emit event to sync toolbar state
      EventBus.emit('dmx_receiver_state_changed', visible);
    }
  },
};
</script>

<style>
.v-application--wrap {
  min-height: 100% !important;
  position: relative;
}
.v-main__wrap {
  overflow: hidden !important;
  position: relative;
}
</style>

<style scoped>
.app_activity{
  position: relative;
  height:100%;
  width: 100%;
}
.top_fragments {
  z-index: 10;
  overflow: hidden;
  resize: vertical;
  min-height: calc(100% - 500px);
  max-height: calc(100% - 280px);
  height: calc(100% - 280px);
}
.top_fragment_left{
  flex: 1;
}
.visualizer {
  height: 100% !important;
}

.dmx-receiver-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  transition: transform 0.3s ease;
  transform: translateY(0);
}

.dmx-receiver-panel.hidden {
  transform: translateY(-100%);
}

/* Animation for the DMX Receiver panel */
.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from, .slide-down-leave-to {
  transform: translateY(-100%);
}

.slide-down-enter-to, .slide-down-leave-from {
  transform: translateY(0);
}

.close-button {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: var(--accent-red);
  color: white;
  border: none;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.close-button:hover {
  background-color: var(--accent-maroon);
}
</style>
