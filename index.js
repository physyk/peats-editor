module.exports = function insertPeatsEditor(config) {
  if (typeof window === "undefined") {
    throw new Error("medium-editor-insert-plugin runs only in a browser.")
  }

  if (!config) config = {}

  var jQuery = require("jquery")

  //Avoiding error related to $.fn.fileupoad
  window.jQuery = window.$ = jQuery

  Handlebars = require("handlebars/runtime")
  MediumEditor = require("medium-editor")

  window.MediumEditor = MediumEditor

  const mediumInsertId = config.mediumInsertId || "medium-insert-id"

  factory(jQuery, Handlebars, config.addons, mediumInsertId)

  startEditor(
    config.selector,
    config.toolbar,
    jQuery,
    MediumEditor,
    mediumInsertId,
    config.onChangeContent
  )
}

function startEditor(
  selector,
  toolbar,
  $,
  MediumEditor,
  mediumInsertId,
  onChangeContent
) {
  var editor = new MediumEditor(selector, { toolbar: toolbar })

  if (onChangeContent) {
    editor.subscribe("editableInput", onChangeContent)
  }

  $(selector).mediumInsert({
    editor: editor
  })
}

function factory($, Handlebars, addons, mediumInsertId) {
  templates.call(this, Handlebars, mediumInsertId)

  videoAddon($, window, document)
  initiateAddons(addons, $)

  core($, addons, window, document)
}

function addonsObject(addons) {
  var obj = {}

  if (addons && addons.length) {
    for (var i = 0; i < addons.length; i++) {
      const name = addons[i].name.toLowerCase()
      obj[name] = true
    }

    return obj
  }
}

function initiateAddons(addons, jQuery) {
  if (addons && addons.length) {
    for (var i = 0; i < addons.length; i++) {
      addons[i].source(jQuery, window, document)
    }
  }
}

function core($, additionalAddons, window, document) {
  "use strict"

  const addons = Object.assign(
    {},
    { embeds: true },
    addonsObject(additionalAddons)
  )

  var pluginName = "mediumInsert",
    defaults = {
      editor: null,
      enabled: true,
      addons: addons
    }

  /**
   * Capitalize first character
   *
   * @param {string} str
   * @return {string}
   */

  function ucfirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  /**
   * Core plugin's object
   *
   * Sets options, variables and calls init() function
   *
   * @constructor
   * @param {DOM} el - DOM element to init the plugin on
   * @param {object} options - Options to override defaults
   * @return {void}
   */

  function Core(el, options) {
    var editor

    this.el = el
    this.$el = $(el)
    this.templates = window.MediumInsert.Templates

    if (options) {
      // Fix #142
      // Avoid deep copying editor object, because since v2.3.0 it contains circular references which causes jQuery.extend to break
      // Instead copy editor object to this.options manually
      editor = options.editor
      options.editor = null
    }
    this.options = $.extend(true, {}, defaults, options)
    this.options.editor = editor

    this._defaults = defaults
    this._name = pluginName

    // Extend editor's functions
    if (this.options && this.options.editor) {
      if (this.options.editor._serialize === undefined) {
        this.options.editor._serialize = this.options.editor.serialize
      }
      if (this.options.editor._destroy === undefined) {
        this.options.editor._destroy = this.options.editor.destroy
      }
      if (this.options.editor._setup === undefined) {
        this.options.editor._setup = this.options.editor.setup
      }
      this.options.editor._hideInsertButtons = this.hideButtons

      this.options.editor.serialize = this.editorSerialize
      this.options.editor.destroy = this.editorDestroy
      this.options.editor.setup = this.editorSetup

      if (this.options.editor.getExtensionByName("placeholder") !== undefined) {
        this.options.editor.getExtensionByName(
          "placeholder"
        ).updatePlaceholder = this.editorUpdatePlaceholder
      }
    }
  }

  /**
   * Initialization
   *
   * @return {void}
   */

  Core.prototype.init = function() {
    this.$el.addClass("medium-editor-insert-plugin")

    if (
      typeof this.options.addons !== "object" ||
      Object.keys(this.options.addons).length === 0
    ) {
      this.disable()
    }

    this.initAddons()
    this.clean()
    this.events()
  }

  /**
   * Event listeners
   *
   * @return {void}
   */

  Core.prototype.events = function() {
    var that = this

    this.$el
      .on("dragover drop", function(e) {
        e.preventDefault()
      })
      .on("keyup click", $.proxy(this, "toggleButtons"))
      .on(
        "selectstart mousedown",
        ".medium-insert, .medium-insert-buttons",
        $.proxy(this, "disableSelection")
      )
      .on("click", ".medium-insert-buttons-show", $.proxy(this, "toggleAddons"))
      .on("click", ".medium-insert-action", $.proxy(this, "addonAction"))
      .on("paste", ".medium-insert-caption-placeholder", function(e) {
        $.proxy(that, "removeCaptionPlaceholder")($(e.target))
      })

    $(window).on("resize", $.proxy(this, "positionButtons", null))
  }

  /**
   * Return editor instance
   *
   * @return {object} MediumEditor
   */

  Core.prototype.getEditor = function() {
    return this.options.editor
  }

  /**
   * Extend editor's serialize function
   *
   * @return {object} Serialized data
   */

  Core.prototype.editorSerialize = function() {
    var data = this._serialize()

    $.each(data, function(key) {
      var $data = $("<div />").html(data[key].value)

      $data.find(".medium-insert-buttons").remove()
      $data.find(".medium-insert-active").removeClass("medium-insert-active")

      // Restore original embed code from embed wrapper attribute value.
      $data.find("[data-embed-code]").each(function() {
        var $this = $(this),
          html = $("<div />")
            .html($this.attr("data-embed-code"))
            .text()
        $this.html(html)
      })

      data[key].value = $data.html()
    })

    return data
  }

  /**
   * Extend editor's destroy function to deactivate this plugin too
   *
   * @return {void}
   */

  Core.prototype.editorDestroy = function() {
    $.each(this.elements, function(key, el) {
      if ($(el).data("plugin_" + pluginName) instanceof Core) {
        $(el)
          .data("plugin_" + pluginName)
          .disable()
      }
    })

    this._destroy()
  }

  /**
   * Extend editor's setup function to activate this plugin too
   *
   * @return {void}
   */

  Core.prototype.editorSetup = function() {
    this._setup()

    $.each(this.elements, function(key, el) {
      if ($(el).data("plugin_" + pluginName) instanceof Core) {
        $(el)
          .data("plugin_" + pluginName)
          .enable()
      }
    })
  }

  /**
   * Extend editor's placeholder.updatePlaceholder function to show placeholder dispite of the plugin buttons
   *
   * @return {void}
   */

  Core.prototype.editorUpdatePlaceholder = function(el, dontShow) {
    var contents = $(el)
      .children()
      .not(".medium-insert-buttons")
      .contents()

    if (
      !dontShow &&
      contents.length === 1 &&
      contents[0].nodeName.toLowerCase() === "br"
    ) {
      this.showPlaceholder(el)
      this.base._hideInsertButtons($(el))
    } else {
      this.hidePlaceholder(el)
    }
  }

  /**
   * Trigger editableInput on editor
   *
   * @return {void}
   */

  Core.prototype.triggerInput = function() {
    if (this.getEditor()) {
      this.getEditor().trigger("editableInput", null, this.el)
    }
  }

  /**
   * Deselects selected text
   *
   * @return {void}
   */

  Core.prototype.deselect = function() {
    document.getSelection().removeAllRanges()
  }

  /**
   * Disables the plugin
   *
   * @return {void}
   */

  Core.prototype.disable = function() {
    this.options.enabled = false

    this.$el.find(".medium-insert-buttons").addClass("hide")
  }

  /**
   * Enables the plugin
   *
   * @return {void}
   */

  Core.prototype.enable = function() {
    this.options.enabled = true

    this.$el.find(".medium-insert-buttons").removeClass("hide")
  }

  /**
   * Disables selectstart mousedown events on plugin elements except images
   *
   * @return {void}
   */

  Core.prototype.disableSelection = function(e) {
    var $el = $(e.target)

    if ($el.is("img") === false || $el.hasClass("medium-insert-buttons-show")) {
      e.preventDefault()
    }
  }

  /**
   * Initialize addons
   *
   * @return {void}
   */

  Core.prototype.initAddons = function() {
    var that = this

    if (!this.options.addons || this.options.addons.length === 0) {
      return
    }

    $.each(this.options.addons, function(addon, options) {
      var addonName = pluginName + ucfirst(addon)

      if (options === false) {
        delete that.options.addons[addon]
        return
      }

      that.$el[addonName](options)
      that.options.addons[addon] = that.$el.data("plugin_" + addonName).options
    })
  }

  /**
   * Cleans a content of the editor
   *
   * @return {void}
   */

  Core.prototype.clean = function() {
    var that = this,
      $buttons,
      $lastEl,
      $text

    if (this.options.enabled === false) {
      return
    }

    if (this.$el.children().length === 0) {
      this.$el.html(
        this.templates["src/js/templates/core-empty-line.hbs"]().trim()
      )
    }

    // Fix #29
    // Wrap content text in <p></p> to avoid Firefox problems
    $text = this.$el.contents().filter(function() {
      return (
        (this.nodeName === "#text" && $.trim($(this).text()) !== "") ||
        this.nodeName.toLowerCase() === "br"
      )
    })

    $text.each(function() {
      $(this).wrap("<p />")

      // Fix #145
      // Move caret at the end of the element that's being wrapped
      that.moveCaret($(this).parent(), $(this).text().length)
    })

    this.addButtons()

    $buttons = this.$el.find(".medium-insert-buttons")
    $lastEl = $buttons.prev()
    if (
      $lastEl.attr("class") &&
      $lastEl.attr("class").match(/medium\-insert(?!\-active)/)
    ) {
      $buttons.before(
        this.templates["src/js/templates/core-empty-line.hbs"]().trim()
      )
    }
  }

  /**
   * Returns HTML template of buttons
   *
   * @return {string} HTML template of buttons
   */

  Core.prototype.getButtons = function() {
    if (this.options.enabled === false) {
      return
    }

    return this.templates["src/js/templates/core-buttons.hbs"]({
      addons: this.options.addons
    }).trim()
  }

  /**
   * Appends buttons at the end of the $el
   *
   * @return {void}
   */

  Core.prototype.addButtons = function() {
    if (this.$el.find(".medium-insert-buttons").length === 0) {
      this.$el.append(this.getButtons())
    }
  }

  /**
   * Move buttons to current active, empty paragraph and show them
   *
   * @return {void}
   */

  Core.prototype.toggleButtons = function(e) {
    var $el = $(e.target),
      selection = window.getSelection(),
      that = this,
      range,
      $current,
      $p,
      activeAddon

    if (this.options.enabled === false) {
      return
    }

    if (!selection || selection.rangeCount === 0) {
      $current = $el
    } else {
      range = selection.getRangeAt(0)
      $current = $(range.commonAncestorContainer)
    }

    // When user clicks on  editor's placeholder in FF, $current el is editor itself, not the first paragraph as it should
    if ($current.hasClass("medium-editor-insert-plugin")) {
      $current = $current.find("p:first")
    }

    $p = $current.is("p") ? $current : $current.closest("p")

    this.clean()

    if (
      $el.hasClass("medium-editor-placeholder") === false &&
      $el.closest(".medium-insert-buttons").length === 0 &&
      $current.closest(".medium-insert-buttons").length === 0
    ) {
      this.$el.find(".medium-insert-active").removeClass("medium-insert-active")

      $.each(this.options.addons, function(addon) {
        if ($el.closest(".medium-insert-" + addon).length) {
          $current = $el
        }

        if ($current.closest(".medium-insert-" + addon).length) {
          $p = $current.closest(".medium-insert-" + addon)
          activeAddon = addon
          return
        }
      })

      if (
        $p.length &&
        (($p.text().trim() === "" && !activeAddon) || activeAddon === "images")
      ) {
        $p.addClass("medium-insert-active")

        if (activeAddon === "images") {
          this.$el
            .find(".medium-insert-buttons")
            .attr("data-active-addon", activeAddon)
        } else {
          this.$el
            .find(".medium-insert-buttons")
            .removeAttr("data-active-addon")
        }

        // If buttons are displayed on addon paragraph, wait 100ms for possible captions to display
        setTimeout(function() {
          that.positionButtons(activeAddon)
          that.showButtons(activeAddon)
        }, activeAddon ? 100 : 0)
      } else {
        this.hideButtons()
      }
    }
  }

  /**
   * Show buttons
   *
   * @param {string} activeAddon - Name of active addon
   * @returns {void}
   */

  Core.prototype.showButtons = function(activeAddon) {
    var $buttons = this.$el.find(".medium-insert-buttons")

    $buttons.show()
    $buttons.find("li").show()

    if (activeAddon) {
      $buttons.find("li").hide()
      $buttons
        .find('button[data-addon="' + activeAddon + '"]')
        .parent()
        .show()
    }
  }

  /**
   * Hides buttons
   *
   * @param {jQuery} $el - Editor element
   * @returns {void}
   */

  Core.prototype.hideButtons = function($el) {
    $el = $el || this.$el

    $el.find(".medium-insert-buttons").hide()
    $el.find(".medium-insert-buttons-addons").hide()
    $el
      .find(".medium-insert-buttons-show")
      .removeClass("medium-insert-buttons-rotate")
  }

  /**
   * Position buttons
   *
   * @param {string} activeAddon - Name of active addon
   * @return {void}
   */

  Core.prototype.positionButtons = function(activeAddon) {
    var $buttons = this.$el.find(".medium-insert-buttons"),
      $p = this.$el.find(".medium-insert-active"),
      $lastCaption = $p.hasClass("medium-insert-images-grid")
        ? []
        : $p.find("figure:last figcaption"),
      elementsContainer = this.getEditor()
        ? this.getEditor().options.elementsContainer
        : $("body").get(0),
      elementsContainerAbsolute =
        ["absolute", "fixed"].indexOf(
          window
            .getComputedStyle(elementsContainer)
            .getPropertyValue("position")
        ) > -1,
      position = {}

    if ($p.length) {
      position.left = $p.position().left
      position.top = $p.position().top

      if (activeAddon) {
        position.left +=
          $p.width() - $buttons.find(".medium-insert-buttons-show").width() - 10
        position.top +=
          $p.height() -
          20 +
          ($lastCaption.length
            ? -$lastCaption.height() -
              parseInt($lastCaption.css("margin-top"), 10)
            : 10)
      } else {
        position.left +=
          -parseInt(
            $buttons.find(".medium-insert-buttons-addons").css("left"),
            10
          ) -
          parseInt(
            $buttons
              .find(".medium-insert-buttons-addons button:first")
              .css("margin-left"),
            10
          )
        position.top += parseInt($p.css("margin-top"), 10)
      }

      if (elementsContainerAbsolute) {
        position.top += elementsContainer.scrollTop
      }

      if (
        this.$el.hasClass("medium-editor-placeholder") === false &&
        position.left < 0
      ) {
        position.left = $p.position().left
      }

      $buttons.css(position)
    }
  }

  /**
   * Toggles addons buttons
   *
   * @return {void}
   */

  Core.prototype.toggleAddons = function() {
    if (
      this.$el.find(".medium-insert-buttons").attr("data-active-addon") ===
      "images"
    ) {
      this.$el
        .find(".medium-insert-buttons")
        .find('button[data-addon="images"]')
        .click()
      return
    }

    this.$el.find(".medium-insert-buttons-addons").fadeToggle()
    this.$el
      .find(".medium-insert-buttons-show")
      .toggleClass("medium-insert-buttons-rotate")
  }

  /**
   * Hide addons buttons
   *
   * @return {void}
   */

  Core.prototype.hideAddons = function() {
    this.$el.find(".medium-insert-buttons-addons").hide()
    this.$el
      .find(".medium-insert-buttons-show")
      .removeClass("medium-insert-buttons-rotate")
  }

  /**
   * Call addon's action
   *
   * @param {Event} e
   * @return {void}
   */

  Core.prototype.addonAction = function(e) {
    var $a = $(e.currentTarget),
      addon = $a.data("addon"),
      action = $a.data("action")

    this.$el.data("plugin_" + pluginName + ucfirst(addon))[action]()
  }

  /**
   * Move caret at the beginning of the empty paragraph
   *
   * @param {jQuery} $el Element where to place the caret
   * @param {integer} position Position where to move caret. Default: 0
   *
   * @return {void}
   */

  Core.prototype.moveCaret = function($el, position) {
    var range, sel, el, textEl

    position = position || 0
    range = document.createRange()
    sel = window.getSelection()
    el = $el.get(0)

    if (!el.childNodes.length) {
      textEl = document.createTextNode(" ")
      el.appendChild(textEl)
    }

    range.setStart(el.childNodes[0], position)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  /**
   * Add caption
   *
   * @param {jQuery Element} $el
   * @param {string} placeholder
   * @return {void}
   */

  Core.prototype.addCaption = function($el, placeholder) {
    var $caption = $el.find("figcaption")

    if ($caption.length === 0) {
      $el.append(
        this.templates["src/js/templates/core-caption.hbs"]({
          placeholder: placeholder
        })
      )
    }
  }

  /**
   * Remove captions
   *
   * @param {jQuery Element} $ignore
   * @return {void}
   */

  Core.prototype.removeCaptions = function($ignore) {
    var $captions = this.$el.find("figcaption")

    if ($ignore) {
      $captions = $captions.not($ignore)
    }

    $captions.each(function() {
      if (
        $(this).hasClass("medium-insert-caption-placeholder") ||
        $(this)
          .text()
          .trim() === ""
      ) {
        $(this).remove()
      }
    })
  }

  /**
   * Remove caption placeholder
   *
   * @param {jQuery Element} $el
   * @return {void}
   */

  Core.prototype.removeCaptionPlaceholder = function($el) {
    var $caption = $el.is("figcaption") ? $el : $el.find("figcaption")

    if ($caption.length) {
      $caption
        .removeClass("medium-insert-caption-placeholder")
        .removeAttr("data-placeholder")
    }
  }

  /** Plugin initialization */

  $.fn[pluginName] = function(options) {
    return this.each(function() {
      var that = this,
        textareaId

      if ($(that).is("textarea")) {
        textareaId = $(that).attr("medium-editor-textarea-id")
        that = $(that)
          .siblings('[medium-editor-textarea-id="' + textareaId + '"]')
          .get(0)
      }

      if (!$.data(that, "plugin_" + pluginName)) {
        // Plugin initialization
        $.data(that, "plugin_" + pluginName, new Core(that, options))
        $.data(that, "plugin_" + pluginName).init()
      } else if (
        typeof options === "string" &&
        $.data(that, "plugin_" + pluginName)[options]
      ) {
        // Method call
        $.data(that, "plugin_" + pluginName)[options]()
      }
    })
  }
}

function templates(Handlebars, containerId) {
  this["MediumInsert"] = this["MediumInsert"] || {}
  this["MediumInsert"]["Templates"] = this["MediumInsert"]["Templates"] || {}

  this["MediumInsert"]["Templates"][
    "src/js/templates/core-buttons.hbs"
  ] = Handlebars.template({
    "1": function(container, depth0, helpers, partials, data) {
      var stack1,
        helper,
        alias1 = depth0 != null ? depth0 : {},
        alias2 = helpers.helperMissing,
        alias3 = "function"

      return (
        '            <li><button data-addon="' +
        container.escapeExpression(
          ((helper =
            (helper = helpers.key || (data && data.key)) != null
              ? helper
              : alias2),
          typeof helper === alias3
            ? helper.call(alias1, {
                name: "key",
                hash: {},
                data: data
              })
            : helper)
        ) +
        '" data-action="add" class="medium-insert-action" type="button">' +
        ((stack1 = ((helper =
          (helper =
            helpers.label || (depth0 != null ? depth0.label : depth0)) != null
            ? helper
            : alias2),
        typeof helper === alias3
          ? helper.call(alias1, {
              name: "label",
              hash: {},
              data: data
            })
          : helper)) != null
          ? stack1
          : "") +
        "</button></li>\n"
      )
    },
    compiler: [7, ">= 4.0.0"],
    main: function(container, depth0, helpers, partials, data) {
      var stack1

      const id = containerId

      return (
        '<div class="medium-insert-buttons" id="' +
        containerId +
        '" contenteditable="false" style="display: none">\n    <button class="medium-insert-buttons-show" type="button"><span>+</span></button>\n    <ul class="medium-insert-buttons-addons" style="display: none">\n' +
        ((stack1 = helpers.each.call(
          depth0 != null ? depth0 : {},
          depth0 != null ? depth0.addons : depth0,
          {
            name: "each",
            hash: {},
            fn: container.program(1, data, 0),
            inverse: container.noop,
            data: data
          }
        )) != null
          ? stack1
          : "") +
        "    </ul>\n</div>\n"
      )
    },
    useData: true
  })

  this["MediumInsert"]["Templates"][
    "src/js/templates/core-caption.hbs"
  ] = Handlebars.template({
    compiler: [7, ">= 4.0.0"],
    main: function(container, depth0, helpers, partials, data) {
      var helper

      return (
        '<figcaption contenteditable="true" class="medium-insert-caption-placeholder" data-placeholder="' +
        container.escapeExpression(
          ((helper =
            (helper =
              helpers.placeholder ||
              (depth0 != null ? depth0.placeholder : depth0)) != null
              ? helper
              : helpers.helperMissing),
          typeof helper === "function"
            ? helper.call(depth0 != null ? depth0 : {}, {
                name: "placeholder",
                hash: {},
                data: data
              })
            : helper)
        ) +
        '"></figcaption>'
      )
    },
    useData: true
  })

  this["MediumInsert"]["Templates"][
    "src/js/templates/core-empty-line.hbs"
  ] = Handlebars.template({
    compiler: [7, ">= 4.0.0"],
    main: function(container, depth0, helpers, partials, data) {
      return "<p><br></p>\n"
    },
    useData: true
  })

  this["MediumInsert"]["Templates"][
    "src/js/templates/embeds-toolbar.hbs"
  ] = Handlebars.template({
    "1": function(container, depth0, helpers, partials, data) {
      var stack1

      return (
        '    <div class="medium-insert-embeds-toolbar medium-editor-toolbar medium-toolbar-arrow-under medium-editor-toolbar-active">\n        <ul class="medium-editor-toolbar-actions clearfix">\n' +
        ((stack1 = helpers.each.call(
          depth0 != null ? depth0 : {},
          depth0 != null ? depth0.styles : depth0,
          {
            name: "each",
            hash: {},
            fn: container.program(2, data, 0),
            inverse: container.noop,
            data: data
          }
        )) != null
          ? stack1
          : "") +
        "        </ul>\n    </div>\n"
      )
    },
    "2": function(container, depth0, helpers, partials, data) {
      var stack1

      return (stack1 = helpers["if"].call(
        depth0 != null ? depth0 : {},
        depth0 != null ? depth0.label : depth0,
        {
          name: "if",
          hash: {},
          fn: container.program(3, data, 0),
          inverse: container.noop,
          data: data
        }
      )) != null
        ? stack1
        : ""
    },
    "3": function(container, depth0, helpers, partials, data) {
      var stack1,
        helper,
        alias1 = depth0 != null ? depth0 : {},
        alias2 = helpers.helperMissing,
        alias3 = "function"

      return (
        '                    <li>\n                        <button class="medium-editor-action" data-action="' +
        container.escapeExpression(
          ((helper =
            (helper = helpers.key || (data && data.key)) != null
              ? helper
              : alias2),
          typeof helper === alias3
            ? helper.call(alias1, {
                name: "key",
                hash: {},
                data: data
              })
            : helper)
        ) +
        '">' +
        ((stack1 = ((helper =
          (helper =
            helpers.label || (depth0 != null ? depth0.label : depth0)) != null
            ? helper
            : alias2),
        typeof helper === alias3
          ? helper.call(alias1, {
              name: "label",
              hash: {},
              data: data
            })
          : helper)) != null
          ? stack1
          : "") +
        "</button>\n                    </li>\n"
      )
    },
    "5": function(container, depth0, helpers, partials, data) {
      var stack1

      return (
        '    <div class="medium-insert-embeds-toolbar2 medium-editor-toolbar medium-editor-toolbar-active">\n        <ul class="medium-editor-toolbar-actions clearfix">\n' +
        ((stack1 = helpers.each.call(
          depth0 != null ? depth0 : {},
          depth0 != null ? depth0.actions : depth0,
          {
            name: "each",
            hash: {},
            fn: container.program(2, data, 0),
            inverse: container.noop,
            data: data
          }
        )) != null
          ? stack1
          : "") +
        "        </ul>\n    </div>\n"
      )
    },
    compiler: [7, ">= 4.0.0"],
    main: function(container, depth0, helpers, partials, data) {
      var stack1,
        alias1 = depth0 != null ? depth0 : {}

      return (
        ((stack1 = helpers["if"].call(
          alias1,
          depth0 != null ? depth0.styles : depth0,
          {
            name: "if",
            hash: {},
            fn: container.program(1, data, 0),
            inverse: container.noop,
            data: data
          }
        )) != null
          ? stack1
          : "") +
        "\n" +
        ((stack1 = helpers["if"].call(
          alias1,
          depth0 != null ? depth0.actions : depth0,
          {
            name: "if",
            hash: {},
            fn: container.program(5, data, 0),
            inverse: container.noop,
            data: data
          }
        )) != null
          ? stack1
          : "")
      )
    },
    useData: true
  })

  this["MediumInsert"]["Templates"][
    "src/js/templates/embeds-wrapper.hbs"
  ] = Handlebars.template({
    compiler: [7, ">= 4.0.0"],
    main: function(container, depth0, helpers, partials, data) {
      var stack1, helper

      return (
        '<div class="medium-insert-embeds" contenteditable="false">\n	<figure>\n		<div class="medium-insert-embed">\n			' +
        ((stack1 = ((helper =
          (helper = helpers.html || (depth0 != null ? depth0.html : depth0)) !=
          null
            ? helper
            : helpers.helperMissing),
        typeof helper === "function"
          ? helper.call(depth0 != null ? depth0 : {}, {
              name: "html",
              hash: {},
              data: data
            })
          : helper)) != null
          ? stack1
          : "") +
        '\n		</div>\n	</figure>\n	<div class="medium-insert-embeds-overlay"></div>\n</div>'
      )
    },
    useData: true
  })

  this["MediumInsert"]["Templates"][
    "src/js/templates/images-fileupload.hbs"
  ] = Handlebars.template({
    compiler: [7, ">= 4.0.0"],
    main: function(container, depth0, helpers, partials, data) {
      return '<input type="file" multiple>'
    },
    useData: true
  })

  this["MediumInsert"]["Templates"][
    "src/js/templates/images-image.hbs"
  ] = Handlebars.template({
    "1": function(container, depth0, helpers, partials, data) {
      return '        <div class="medium-insert-images-progress"></div>\n'
    },
    compiler: [7, ">= 4.0.0"],
    main: function(container, depth0, helpers, partials, data) {
      var stack1,
        helper,
        alias1 = depth0 != null ? depth0 : {}

      return (
        '<figure contenteditable="false">\n    <img src="' +
        container.escapeExpression(
          ((helper =
            (helper = helpers.img || (depth0 != null ? depth0.img : depth0)) !=
            null
              ? helper
              : helpers.helperMissing),
          typeof helper === "function"
            ? helper.call(alias1, {
                name: "img",
                hash: {},
                data: data
              })
            : helper)
        ) +
        '" alt="" />\n' +
        ((stack1 = helpers["if"].call(
          alias1,
          depth0 != null ? depth0.progress : depth0,
          {
            name: "if",
            hash: {},
            fn: container.program(1, data, 0),
            inverse: container.noop,
            data: data
          }
        )) != null
          ? stack1
          : "") +
        "</figure>\n"
      )
    },
    useData: true
  })

  this["MediumInsert"]["Templates"][
    "src/js/templates/images-progressbar.hbs"
  ] = Handlebars.template({
    compiler: [7, ">= 4.0.0"],
    main: function(container, depth0, helpers, partials, data) {
      return '<progress min="0" max="100" value="0">0</progress>'
    },
    useData: true
  })

  this["MediumInsert"]["Templates"][
    "src/js/templates/images-toolbar.hbs"
  ] = Handlebars.template({
    "1": function(container, depth0, helpers, partials, data) {
      var stack1

      return (stack1 = helpers["if"].call(
        depth0 != null ? depth0 : {},
        depth0 != null ? depth0.label : depth0,
        {
          name: "if",
          hash: {},
          fn: container.program(2, data, 0),
          inverse: container.noop,
          data: data
        }
      )) != null
        ? stack1
        : ""
    },
    "2": function(container, depth0, helpers, partials, data) {
      var stack1,
        helper,
        alias1 = depth0 != null ? depth0 : {},
        alias2 = helpers.helperMissing,
        alias3 = "function"

      return (
        '                <li>\n                    <button class="medium-editor-action" data-action="' +
        container.escapeExpression(
          ((helper =
            (helper = helpers.key || (data && data.key)) != null
              ? helper
              : alias2),
          typeof helper === alias3
            ? helper.call(alias1, {
                name: "key",
                hash: {},
                data: data
              })
            : helper)
        ) +
        '">' +
        ((stack1 = ((helper =
          (helper =
            helpers.label || (depth0 != null ? depth0.label : depth0)) != null
            ? helper
            : alias2),
        typeof helper === alias3
          ? helper.call(alias1, {
              name: "label",
              hash: {},
              data: data
            })
          : helper)) != null
          ? stack1
          : "") +
        "</button>\n                </li>\n"
      )
    },
    "4": function(container, depth0, helpers, partials, data) {
      var stack1

      return (
        '	<div class="medium-insert-images-toolbar2 medium-editor-toolbar medium-editor-toolbar-active">\n		<ul class="medium-editor-toolbar-actions clearfix">\n' +
        ((stack1 = helpers.each.call(
          depth0 != null ? depth0 : {},
          depth0 != null ? depth0.actions : depth0,
          {
            name: "each",
            hash: {},
            fn: container.program(5, data, 0),
            inverse: container.noop,
            data: data
          }
        )) != null
          ? stack1
          : "") +
        "    	</ul>\n    </div>\n"
      )
    },
    "5": function(container, depth0, helpers, partials, data) {
      var stack1

      return (stack1 = helpers["if"].call(
        depth0 != null ? depth0 : {},
        depth0 != null ? depth0.label : depth0,
        {
          name: "if",
          hash: {},
          fn: container.program(6, data, 0),
          inverse: container.noop,
          data: data
        }
      )) != null
        ? stack1
        : ""
    },
    "6": function(container, depth0, helpers, partials, data) {
      var stack1,
        helper,
        alias1 = depth0 != null ? depth0 : {},
        alias2 = helpers.helperMissing,
        alias3 = "function"

      return (
        '        	        <li>\n        	            <button class="medium-editor-action" data-action="' +
        container.escapeExpression(
          ((helper =
            (helper = helpers.key || (data && data.key)) != null
              ? helper
              : alias2),
          typeof helper === alias3
            ? helper.call(alias1, {
                name: "key",
                hash: {},
                data: data
              })
            : helper)
        ) +
        '">' +
        ((stack1 = ((helper =
          (helper =
            helpers.label || (depth0 != null ? depth0.label : depth0)) != null
            ? helper
            : alias2),
        typeof helper === alias3
          ? helper.call(alias1, {
              name: "label",
              hash: {},
              data: data
            })
          : helper)) != null
          ? stack1
          : "") +
        "</button>\n        	        </li>\n"
      )
    },
    compiler: [7, ">= 4.0.0"],
    main: function(container, depth0, helpers, partials, data) {
      var stack1,
        alias1 = depth0 != null ? depth0 : {}

      return (
        '<div class="medium-insert-images-toolbar medium-editor-toolbar medium-toolbar-arrow-under medium-editor-toolbar-active">\n    <ul class="medium-editor-toolbar-actions clearfix">\n' +
        ((stack1 = helpers.each.call(
          alias1,
          depth0 != null ? depth0.styles : depth0,
          {
            name: "each",
            hash: {},
            fn: container.program(1, data, 0),
            inverse: container.noop,
            data: data
          }
        )) != null
          ? stack1
          : "") +
        "    </ul>\n</div>\n\n" +
        ((stack1 = helpers["if"].call(
          alias1,
          depth0 != null ? depth0.actions : depth0,
          {
            name: "if",
            hash: {},
            fn: container.program(4, data, 0),
            inverse: container.noop,
            data: data
          }
        )) != null
          ? stack1
          : "")
      )
    },
    useData: true
  })
}

function videoAddon($, window, document) {
  "use strict"

  /** Default values */
  var pluginName = "mediumInsert",
    addonName = "Embeds", // first char is uppercase
    defaults = {
      label: '<span class="fa fa-youtube-play"></span>',
      placeholder:
        "Paste a YouTube, Vimeo, Facebook, Twitter or Instagram link and press Enter",
      oembedProxy: "http://medium.iframe.ly/api/oembed?iframe=1",
      captions: true,
      captionPlaceholder: "Type caption (optional)",
      storeMeta: false,
      styles: {
        wide: {
          label: '<span class="fa fa-align-justify"></span>'
          // added: function ($el) {},
          // removed: function ($el) {}
        },
        left: {
          label: '<span class="fa fa-align-left"></span>'
          // added: function ($el) {},
          // removed: function ($el) {}
        },
        right: {
          label: '<span class="fa fa-align-right"></span>'
          // added: function ($el) {},
          // removed: function ($el) {}
        }
      },
      actions: {
        remove: {
          label: '<span class="fa fa-times"></span>',
          clicked: function() {
            var $event = $.Event("keydown")

            $event.which = 8
            $(document).trigger($event)
          }
        }
      },
      parseOnPaste: false
    }

  /**
   * Embeds object
   *
   * Sets options, variables and calls init() function
   *
   * @constructor
   * @param {DOM} el - DOM element to init the plugin on
   * @param {object} options - Options to override defaults
   * @return {void}
   */

  function Embeds(el, options) {
    this.el = el
    this.$el = $(el)
    this.templates = window.MediumInsert.Templates
    this.core = this.$el.data("plugin_" + pluginName)

    this.options = $.extend(true, {}, defaults, options)

    this._defaults = defaults
    this._name = pluginName

    // Extend editor's functions
    if (this.core.getEditor()) {
      this.core.getEditor()._serializePreEmbeds = this.core.getEditor().serialize
      this.core.getEditor().serialize = this.editorSerialize
    }

    this.init()
  }

  /**
   * Initialization
   *
   * @return {void}
   */

  Embeds.prototype.init = function() {
    var $embeds = this.$el.find(".medium-insert-embeds")

    $embeds.attr("contenteditable", false)
    $embeds.each(function() {
      if ($(this).find(".medium-insert-embeds-overlay").length === 0) {
        $(this).append($("<div />").addClass("medium-insert-embeds-overlay"))
      }
    })

    this.events()
    this.backwardsCompatibility()
  }

  /**
   * Event listeners
   *
   * @return {void}
   */

  Embeds.prototype.events = function() {
    $(document)
      .on("click", $.proxy(this, "unselectEmbed"))
      .on("keydown", $.proxy(this, "removeEmbed"))
      .on(
        "click",
        ".medium-insert-embeds-toolbar .medium-editor-action",
        $.proxy(this, "toolbarAction")
      )
      .on(
        "click",
        ".medium-insert-embeds-toolbar2 .medium-editor-action",
        $.proxy(this, "toolbar2Action")
      )

    this.$el
      .on("keyup click paste", $.proxy(this, "togglePlaceholder"))
      .on("keydown", $.proxy(this, "processLink"))
      .on(
        "click",
        ".medium-insert-embeds-overlay",
        $.proxy(this, "selectEmbed")
      )
      .on(
        "contextmenu",
        ".medium-insert-embeds-placeholder",
        $.proxy(this, "fixRightClickOnPlaceholder")
      )

    if (this.options.parseOnPaste) {
      this.$el.on("paste", $.proxy(this, "processPasted"))
    }

    $(window).on("resize", $.proxy(this, "autoRepositionToolbars"))
  }

  /**
   * Replace v0.* class names with new ones, wrap embedded content to new structure
   *
   * @return {void}
   */

  Embeds.prototype.backwardsCompatibility = function() {
    var that = this

    this.$el
      .find(".mediumInsert-embeds")
      .removeClass("mediumInsert-embeds")
      .addClass("medium-insert-embeds")

    this.$el.find(".medium-insert-embeds").each(function() {
      if ($(this).find(".medium-insert-embed").length === 0) {
        $(this).after(
          that.templates["src/js/templates/embeds-wrapper.hbs"]({
            html: $(this).html()
          })
        )
        $(this).remove()
      }
    })
  }

  /**
   * Extend editor's serialize function
   *
   * @return {object} Serialized data
   */

  Embeds.prototype.editorSerialize = function() {
    var data = this._serializePreEmbeds()

    $.each(data, function(key) {
      var $data = $("<div />").html(data[key].value)

      $data.find(".medium-insert-embeds").removeAttr("contenteditable")
      $data.find(".medium-insert-embeds-overlay").remove()

      data[key].value = $data.html()
    })

    return data
  }

  /**
   * Add embedded element
   *
   * @return {void}
   */

  Embeds.prototype.add = function() {
    var $place = this.$el.find(".medium-insert-active")

    // Fix #132
    // Make sure that the content of the paragraph is empty and <br> is wrapped in <p></p> to avoid Firefox problems
    $place.html(this.templates["src/js/templates/core-empty-line.hbs"]().trim())

    // Replace paragraph with div to prevent #124 issue with pasting in Chrome,
    // because medium editor wraps inserted content into paragraph and paragraphs can't be nested
    if ($place.is("p")) {
      $place.replaceWith(
        '<div class="medium-insert-active">' + $place.html() + "</div>"
      )
      $place = this.$el.find(".medium-insert-active")
      this.core.moveCaret($place)
    }

    $place.addClass(
      "medium-insert-embeds medium-insert-embeds-input medium-insert-embeds-active"
    )

    this.togglePlaceholder({ target: $place.get(0) })

    $place.click()
    this.core.hideButtons()
  }

  /**
   * Toggles placeholder
   *
   * @param {Event} e
   * @return {void}
   */

  Embeds.prototype.togglePlaceholder = function(e) {
    var $place = $(e.target),
      selection = window.getSelection(),
      range,
      $current,
      text

    if (!selection || selection.rangeCount === 0) {
      return
    }

    range = selection.getRangeAt(0)
    $current = $(range.commonAncestorContainer)

    if ($current.hasClass("medium-insert-embeds-active")) {
      $place = $current
    } else if ($current.closest(".medium-insert-embeds-active").length) {
      $place = $current.closest(".medium-insert-embeds-active")
    }

    if ($place.hasClass("medium-insert-embeds-active")) {
      text = $place.text().trim()

      if (
        text === "" &&
        $place.hasClass("medium-insert-embeds-placeholder") === false
      ) {
        $place
          .addClass("medium-insert-embeds-placeholder")
          .attr("data-placeholder", this.options.placeholder)
      } else if (
        text !== "" &&
        $place.hasClass("medium-insert-embeds-placeholder")
      ) {
        $place
          .removeClass("medium-insert-embeds-placeholder")
          .removeAttr("data-placeholder")
      }
    } else {
      this.$el.find(".medium-insert-embeds-active").remove()
    }
  }

  /**
   * Right click on placeholder in Chrome selects whole line. Fix this by placing caret at the end of line
   *
   * @param {Event} e
   * @return {void}
   */

  Embeds.prototype.fixRightClickOnPlaceholder = function(e) {
    this.core.moveCaret($(e.target))
  }

  /**
   * Process link
   *
   * @param {Event} e
   * @return {void}
   */

  Embeds.prototype.processLink = function(e) {
    var $place = this.$el.find(".medium-insert-embeds-active"),
      url

    if (!$place.length) {
      return
    }

    url = $place.text().trim()

    // Return empty placeholder on backspace, delete or enter
    if (url === "" && [8, 46, 13].indexOf(e.which) !== -1) {
      $place.remove()
      return
    }

    if (e.which === 13) {
      e.preventDefault()
      e.stopPropagation()

      if (this.options.oembedProxy) {
        this.oembed(url)
      } else {
        this.parseUrl(url)
      }
    }
  }

  /**
   * Process Pasted
   *
   * @param {Event} e
   * @return {void}
   */

  Embeds.prototype.processPasted = function(e) {
    var pastedUrl, linkRegEx
    if ($(".medium-insert-embeds-active").length) {
      return
    }

    pastedUrl = e.originalEvent.clipboardData.getData("text")
    linkRegEx = new RegExp("^(http(s?):)?//", "i")
    if (linkRegEx.test(pastedUrl)) {
      if (this.options.oembedProxy) {
        this.oembed(pastedUrl, true)
      } else {
        this.parseUrl(pastedUrl, true)
      }
    }
  }

  /**
   * Get HTML via oEmbed proxy
   *
   * @param {string} url
   * @return {void}
   */

  Embeds.prototype.oembed = function(url, pasted) {
    var that = this

    $.support.cors = true

    $.ajax({
      crossDomain: true,
      cache: false,
      url: this.options.oembedProxy,
      dataType: "json",
      data: {
        url: url
      },
      success: function(data) {
        var html = data && data.html

        if (that.options.storeMeta) {
          html +=
            '<div class="medium-insert-embeds-meta"><script type="text/json">' +
            JSON.stringify(data) +
            "</script></div>"
        }

        if (data && !html && data.type === "photo" && data.url) {
          html = '<img src="' + data.url + '" alt="">'
        }

        if (!html) {
          // Prevent render empty embed.
          $.proxy(that, "convertBadEmbed", url)()
          return
        }

        if (pasted) {
          $.proxy(that, "embed", html, url)()
        } else {
          $.proxy(that, "embed", html)()
        }
      },
      error: function(jqXHR, textStatus, errorThrown) {
        var responseJSON = (function() {
          try {
            return JSON.parse(jqXHR.responseText)
          } catch (e) {}
        })()

        if (typeof window.console !== "undefined") {
          window.console.log(
            (responseJSON && responseJSON.error) ||
              jqXHR.status ||
              errorThrown.message
          )
        } else {
          window.alert(
            "Error requesting media from " +
              that.options.oembedProxy +
              " to insert: " +
              errorThrown +
              " (response status: " +
              jqXHR.status +
              ")"
          )
        }

        $.proxy(that, "convertBadEmbed", url)()
      }
    })
  }

  /**
   * Get HTML using regexp
   *
   * @param {string} url
   * @param {bool} pasted
   * @return {void}
   */

  Embeds.prototype.parseUrl = function(url, pasted) {
    var html

    if (
      !new RegExp(
        [
          "youtube",
          "youtu.be",
          "vimeo",
          "instagram",
          "twitter",
          "facebook"
        ].join("|")
      ).test(url)
    ) {
      $.proxy(this, "convertBadEmbed", url)()
      return false
    }

    html = url
      .replace(/\n?/g, "")
      .replace(
        /^((http(s)?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=|v\/)?)([a-zA-Z0-9\-_]+)(.*)?$/,
        '<div class="video video-youtube"><iframe width="420" height="315" src="//www.youtube.com/embed/$7" frameborder="0" allowfullscreen></iframe></div>'
      )
      .replace(
        /^https?:\/\/vimeo\.com(\/.+)?\/([0-9]+)$/,
        '<div class="video video-vimeo"><iframe src="//player.vimeo.com/video/$2" width="500" height="281" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>'
      )
      .replace(
        /^https:\/\/twitter\.com\/(\w+)\/status\/(\d+)\/?$/,
        '<blockquote class="twitter-tweet" align="center" lang="en"><a href="https://twitter.com/$1/statuses/$2"></a></blockquote><script async src="//platform.twitter.com/widgets.js" charset="utf-8"></script>'
      )
      .replace(
        /^(https:\/\/www\.facebook\.com\/(.*))$/,
        '<script src="//connect.facebook.net/en_US/sdk.js#xfbml=1&amp;version=v2.2" async></script><div class="fb-post" data-href="$1"><div class="fb-xfbml-parse-ignore"><a href="$1">Loading Facebook post...</a></div></div>'
      )
      .replace(
        /^https?:\/\/instagram\.com\/p\/(.+)\/?$/,
        '<span class="instagram"><iframe src="//instagram.com/p/$1/embed/" width="612" height="710" frameborder="0" scrolling="no" allowtransparency="true"></iframe></span>'
      )

    if (this.options.storeMeta) {
      html +=
        '<div class="medium-insert-embeds-meta"><script type="text/json">' +
        JSON.stringify({}) +
        "</script></div>"
    }

    if (/<("[^"]*"|'[^']*'|[^'">])*>/.test(html) === false) {
      $.proxy(this, "convertBadEmbed", url)()
      return false
    }

    if (pasted) {
      this.embed(html, url)
    } else {
      this.embed(html)
    }
  }

  /**
   * Add html to page
   *
   * @param {string} html
   * @param {string} pastedUrl
   * @return {void}
   */

  Embeds.prototype.embed = function(html, pastedUrl) {
    var $place = this.$el.find(".medium-insert-embeds-active"),
      $div

    if (!html) {
      alert("Incorrect URL format specified")
      return false
    } else {
      if (html.indexOf("</script>") > -1) {
        // Store embed code with <script> tag inside wrapper attribute value.
        // Make nice attribute value escaping using jQuery.
        $div = $("<div>")
          .attr(
            "data-embed-code",
            $("<div />")
              .text(html)
              .html()
          )
          .html(html)
        html = $("<div>")
          .append($div)
          .html()
      }

      if (pastedUrl) {
        // Get the element with the pasted url
        // place the embed template and remove the pasted text
        $place = this.$el
          .find(":not(iframe, script, style)")
          .contents()
          .filter(function() {
            return (
              this.nodeType === 3 && this.textContent.indexOf(pastedUrl) > -1
            )
          })
          .parent()

        $place.after(
          this.templates["src/js/templates/embeds-wrapper.hbs"]({
            html: html
          })
        )
        $place.text($place.text().replace(pastedUrl, ""))
      } else {
        $place.after(
          this.templates["src/js/templates/embeds-wrapper.hbs"]({
            html: html
          })
        )
        $place.remove()
      }

      this.core.triggerInput()

      if (html.indexOf("facebook") !== -1) {
        if (typeof FB !== "undefined") {
          setTimeout(function() {
            FB.XFBML.parse()
          }, 2000)
        }
      }
    }
  }

  /**
   * Convert bad oEmbed content to an actual line.
   * Instead of displaying the error message we convert the bad embed
   *
   * @param {string} content Bad content
   *
   * @return {void}
   */
  Embeds.prototype.convertBadEmbed = function(content) {
    var $place,
      $empty,
      $content,
      emptyTemplate = this.templates[
        "src/js/templates/core-empty-line.hbs"
      ]().trim()

    $place = this.$el.find(".medium-insert-embeds-active")

    // convert embed node to an empty node and insert the bad embed inside
    $content = $(emptyTemplate)
    $place.before($content)
    $place.remove()
    $content.html(content)

    // add an new empty node right after to simulate Enter press
    $empty = $(emptyTemplate)
    $content.after($empty)

    this.core.triggerInput()

    this.core.moveCaret($empty)
  }

  /**
   * Select clicked embed
   *
   * @param {Event} e
   * @returns {void}
   */

  Embeds.prototype.selectEmbed = function(e) {
    var that = this,
      $embed
    if (this.core.options.enabled) {
      $embed = $(e.target).hasClass("medium-insert-embeds")
        ? $(e.target)
        : $(e.target).closest(".medium-insert-embeds")

      $embed.addClass("medium-insert-embeds-selected")

      setTimeout(function() {
        that.addToolbar()

        if (that.options.captions) {
          that.core.addCaption(
            $embed.find("figure"),
            that.options.captionPlaceholder
          )
        }
      }, 50)
    }
  }

  /**
   * Unselect selected embed
   *
   * @param {Event} e
   * @returns {void}
   */

  Embeds.prototype.unselectEmbed = function(e) {
    var $el = $(e.target).hasClass("medium-insert-embeds")
        ? $(e.target)
        : $(e.target).closest(".medium-insert-embeds"),
      $embed = this.$el.find(".medium-insert-embeds-selected")

    if ($el.hasClass("medium-insert-embeds-selected")) {
      $embed.not($el).removeClass("medium-insert-embeds-selected")
      $(
        ".medium-insert-embeds-toolbar, .medium-insert-embeds-toolbar2"
      ).remove()
      this.core.removeCaptions($el.find("figcaption"))

      if (
        $(e.target).is(".medium-insert-caption-placeholder") ||
        $(e.target).is("figcaption")
      ) {
        $el.removeClass("medium-insert-embeds-selected")
        this.core.removeCaptionPlaceholder($el.find("figure"))
      }
      return
    }

    $embed.removeClass("medium-insert-embeds-selected")
    $(".medium-insert-embeds-toolbar, .medium-insert-embeds-toolbar2").remove()

    if ($(e.target).is(".medium-insert-caption-placeholder")) {
      this.core.removeCaptionPlaceholder($el.find("figure"))
    } else if ($(e.target).is("figcaption") === false) {
      this.core.removeCaptions()
    }
  }

  /**
   * Remove embed
   *
   * @param {Event} e
   * @returns {void}
   */

  Embeds.prototype.removeEmbed = function(e) {
    var $embed, $empty

    if (e.which === 8 || e.which === 46) {
      $embed = this.$el.find(".medium-insert-embeds-selected")

      if ($embed.length) {
        e.preventDefault()

        $(
          ".medium-insert-embeds-toolbar, .medium-insert-embeds-toolbar2"
        ).remove()

        $empty = $(
          this.templates["src/js/templates/core-empty-line.hbs"]().trim()
        )
        $embed.before($empty)
        $embed.remove()

        // Hide addons
        this.core.hideAddons()

        this.core.moveCaret($empty)
        this.core.triggerInput()
      }
    }
  }

  /**
   * Adds embed toolbar to editor
   *
   * @returns {void}
   */

  Embeds.prototype.addToolbar = function() {
    var $embed = this.$el.find(".medium-insert-embeds-selected"),
      active = false,
      $toolbar,
      $toolbar2,
      mediumEditor,
      toolbarContainer

    if ($embed.length === 0) {
      return
    }

    mediumEditor = this.core.getEditor()
    toolbarContainer = mediumEditor.options.elementsContainer || "body"

    $(toolbarContainer).append(
      this.templates["src/js/templates/embeds-toolbar.hbs"]({
        styles: this.options.styles,
        actions: this.options.actions
      }).trim()
    )

    $toolbar = $(".medium-insert-embeds-toolbar")
    $toolbar2 = $(".medium-insert-embeds-toolbar2")

    $toolbar.find("button").each(function() {
      if ($embed.hasClass("medium-insert-embeds-" + $(this).data("action"))) {
        $(this).addClass("medium-editor-button-active")
        active = true
      }
    })

    if (active === false) {
      $toolbar
        .find("button")
        .first()
        .addClass("medium-editor-button-active")
    }

    this.repositionToolbars()
    $toolbar.fadeIn()
    $toolbar2.fadeIn()
  }

  Embeds.prototype.autoRepositionToolbars = function() {
    setTimeout(
      function() {
        this.repositionToolbars()
        this.repositionToolbars()
      }.bind(this),
      0
    )
  }

  Embeds.prototype.repositionToolbars = function() {
    var $toolbar = $(".medium-insert-embeds-toolbar"),
      $toolbar2 = $(".medium-insert-embeds-toolbar2"),
      $embed = this.$el.find(".medium-insert-embeds-selected"),
      elementsContainer = this.core.getEditor().options.elementsContainer,
      elementsContainerAbsolute =
        ["absolute", "fixed"].indexOf(
          window
            .getComputedStyle(elementsContainer)
            .getPropertyValue("position")
        ) > -1,
      elementsContainerBoundary = elementsContainerAbsolute
        ? elementsContainer.getBoundingClientRect()
        : null,
      containerWidth = $(window).width(),
      position = {}

    if ($toolbar2.length) {
      position.top = $embed.offset().top + 2 // 2px - distance from a border
      position.left =
        $embed.offset().left + $embed.width() - $toolbar2.width() - 4 // 4px - distance from a border

      if (elementsContainerAbsolute) {
        position.top +=
          elementsContainer.scrollTop - elementsContainerBoundary.top
        position.left -= elementsContainerBoundary.left
        containerWidth = $(elementsContainer).width()
      }

      if (position.left + $toolbar2.width() > containerWidth) {
        position.left = containerWidth - $toolbar2.width()
      }

      $toolbar2.css(position)
    }

    if ($toolbar.length) {
      position.left =
        $embed.offset().left + $embed.width() / 2 - $toolbar.width() / 2
      position.top = $embed.offset().top - $toolbar.height() - 8 - 2 - 5 // 8px - hight of an arrow under toolbar, 2px - height of an embed outset, 5px - distance from an embed

      if (elementsContainerAbsolute) {
        position.top +=
          elementsContainer.scrollTop - elementsContainerBoundary.top
        position.left -= elementsContainerBoundary.left
      }

      if (position.top < 0) {
        position.top = 0
      }

      $toolbar.css(position)
    }
  }

  /**
   * Fires toolbar action
   *
   * @param {Event} e
   * @returns {void}
   */

  Embeds.prototype.toolbarAction = function(e) {
    var $button = $(e.target).is("button")
        ? $(e.target)
        : $(e.target).closest("button"),
      $li = $button.closest("li"),
      $ul = $li.closest("ul"),
      $lis = $ul.find("li"),
      $embed = this.$el.find(".medium-insert-embeds-selected"),
      that = this

    $button.addClass("medium-editor-button-active")
    $li
      .siblings()
      .find(".medium-editor-button-active")
      .removeClass("medium-editor-button-active")

    $lis.find("button").each(function() {
      var className = "medium-insert-embeds-" + $(this).data("action")

      if ($(this).hasClass("medium-editor-button-active")) {
        $embed.addClass(className)

        if (that.options.styles[$(this).data("action")].added) {
          that.options.styles[$(this).data("action")].added($embed)
        }
      } else {
        $embed.removeClass(className)

        if (that.options.styles[$(this).data("action")].removed) {
          that.options.styles[$(this).data("action")].removed($embed)
        }
      }
    })

    this.core.triggerInput()
  }

  /**
   * Fires toolbar2 action
   *
   * @param {Event} e
   * @returns {void}
   */

  Embeds.prototype.toolbar2Action = function(e) {
    var $button = $(e.target).is("button")
        ? $(e.target)
        : $(e.target).closest("button"),
      callback = this.options.actions[$button.data("action")].clicked

    if (callback) {
      callback(this.$el.find(".medium-insert-embeds-selected"))
    }

    this.core.triggerInput()
  }

  /** Plugin initialization */

  $.fn[pluginName + addonName] = function(options) {
    return this.each(function() {
      if (!$.data(this, "plugin_" + pluginName + addonName)) {
        $.data(
          this,
          "plugin_" + pluginName + addonName,
          new Embeds(this, options)
        )
      }
    })
  }
}
