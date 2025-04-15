<template>
  <uk-flex
    col
    class="app_activity"
  >
    <toolbar />
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
    
    <div v-if="ready" class="floating-panel-container">
      <div class="floating-panel" :class="{ 'collapsed': dmxReceiverCollapsed }">
        <div class="floating-panel-header" @click="dmxReceiverCollapsed = !dmxReceiverCollapsed">
          <span>DMX Receiver</span>
          <button class="collapse-btn">{{ dmxReceiverCollapsed ? '▼' : '▲' }}</button>
        </div>
        <div v-show="!dmxReceiverCollapsed" class="floating-panel-content">
          <dmx-receiver />
        </div>
      </div>
    </div>
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
       * DMX Receiver panel collapsed state
       */
      dmxReceiverCollapsed: false,
    };
  },
  watch: {
    '$show.loading': {
      deep: true,
      handler(value) {
        this.loader = value;
      },
    },
  },
  async mounted() {
    this.$router._appReayState = false;
    EventBus.on('visualizer_loaded', this.setup);
    EventBus.on('app_error', (err) => {
      this.loader.message = 'An error occured while loading the app...';
      this.errPopup.error = err;
      this.errPopup.state = true;
    });
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
.dmx-receiver-container {
  margin: 16px;
  z-index: 10;
}
.floating-panel-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  max-width: 400px;
  width: 100%;
}

.floating-panel {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  transition: all 0.3s ease;
}

.floating-panel.collapsed {
  max-height: 40px;
}

.floating-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background-color: #2196F3;
  color: white;
  cursor: pointer;
  font-weight: bold;
}

.collapse-btn {
  background: none;
  border: none;
  color: white;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
}

.floating-panel-content {
  padding: 0;
}

.floating-panel-content .dmx-receiver {
  border: none;
  border-radius: 0;
  margin-bottom: 0;
}
</style>
