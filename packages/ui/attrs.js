
// An AttributeHandler object is responsible for updating a particular attribute
// of a particular element.  AttributeHandler subclasses implement
// browser-specific logic for dealing with particular attributes across
// different browsers.
//
// To define a new type of AttributeHandler, use
// `var FooHandler = AttributeHandler.extend({ update: function ... })`
// where the `update` function takes arguments `(element, oldValue, value)`.
// The `element` argument is always the same between calls to `update` on
// the same instance.  `oldValue` and `value` are each either `null` or
// a Unicode string of the type that might be passed to the value argument
// of `setAttribute` (i.e. not an HTML string with character references).
// When an AttributeHandler is installed, an initial call to `update` is
// always made with `oldValue = null`.  The `update` method can access
// `this.name` if the AttributeHandler class is a generic one that applies
// to multiple attribute names.
//
// AttributeHandlers can store custom properties on `this`, as long as they
// don't use the names `element`, `name`, `value`, and `oldValue`.
//
// AttributeHandlers can't influence how attributes appear in rendered HTML,
// only how they are updated after materialization as DOM.

AttributeHandler = function (name, value) {
  this.name = name;
  this.value = value;
};

AttributeHandler.prototype.update = function (element, oldValue, value) {
  if (value === null) {
    if (oldValue !== null)
      element.removeAttribute(this.name);
  } else {
    element.setAttribute(this.name, value);
  }
};

// _assign is like _.extend or the upcoming Object.assign.
// Copy src's own, enumerable properties onto tgt and return
// tgt.
var _assign = function (tgt, src) {
  for (var k in src)
    if (src.hasOwnProperty(k))
      tgt[k] = src[k];
  return tgt;
};

// return an array with the falsy elements removed
var _arrayCompact = function (array) {
  var result = [];
  for (var i = 0; i < array.length; i++) {
    var item = array[i];
    if (item)
      result.push(item);
  }
  return result;
};

var _arrayContains = function (array, item) {
  for (var i = 0; i < array.length; i++) {
    if (array[i] === item)
      return true;
  }
  return false;
};

var _arrayWithout = function (array, item) {
  var result = [];
  for (var i = 0; i < array.length; i++) {
    var x = array[i];
    if (x !== item)
      result.push(x);
  }
  return result;
};

AttributeHandler.extend = function (options) {
  var curType = this;
  var subType = function AttributeHandlerSubtype(/*arguments*/) {
    AttributeHandler.apply(this, arguments);
  };
  subType.prototype = new curType;
  subType.extend = curType.extend;
  if (options)
    _assign(subType.prototype, options);
  return subType;
};

// Extended below to support both regular and SVG elements
var BaseClassHandler = AttributeHandler.extend({
  update: function (element, oldValue, value) {
    if (!this.getCurrentValue || !this.setValue)
      throw new Error("Missing methods in subclass of 'BaseClassHandler'");

    var oldClasses = oldValue ? _arrayCompact(oldValue.split(' ')) : [];
    var newClasses = value ? _arrayCompact(value.split(' ')) : [];

    // the current classes on the element, which we will mutate.
    var classes = _arrayCompact(this.getCurrentValue(element).split(' '));

    // optimize this later (to be asymptotically faster) if necessary
    for (var i = 0; i < oldClasses.length; i++) {
      var c = oldClasses[i];
      if (! _arrayContains(newClasses, c))
        classes = _arrayWithout(classes, c);
    }
    for (var i = 0; i < newClasses.length; i++) {
      var c = newClasses[i];
      if ((! _arrayContains(oldClasses, c)) &&
          (! _arrayContains(classes, c)))
        classes.push(c);
    }

    this.setValue(element, classes.join(' '));
  }
});

var ClassHandler = BaseClassHandler.extend({
  // @param rawValue {String}
  getCurrentValue: function (element) {
    return element.className;
  },
  setValue: function (element, className) {
    element.className = className;
  }
});

var SVGClassHandler = BaseClassHandler.extend({
  getCurrentValue: function (element) {
    return element.className.baseVal;
  },
  setValue: function (element, className) {
    element.setAttribute('class', className);
  }
});

var BooleanHandler = AttributeHandler.extend({
  update: function (element, oldValue, value) {
    var focused = this.focused(element);

    if (!focused) {
      var name = this.name;
      if (value == null) {
        if (oldValue != null)
          element[name] = false;
      } else {
        element[name] = true;
      }
    }
  },
  // is the element part of a control which is focused?
  focused: function (element) {
    if (element.tagName === 'INPUT') {
      return element === document.activeElement;

    } else if (element.tagName === 'OPTION') {
      // find the containing SELECT element, on which focus
      // is actually set
      var selectEl = element;
      while (selectEl && selectEl.tagName !== 'SELECT')
        selectEl = selectEl.parentNode;

      if (selectEl)
        return selectEl === document.activeElement;
      else
        return false;
    } else {
      throw new Error("Expected INPUT or OPTION element");
    }
  }
});

var ValueHandler = AttributeHandler.extend({
  update: function (element, oldValue, value) {
    var focused = (element === document.activeElement);

    if (!focused)
      element.value = value;
  }
});

// attributes of the type 'xlink:something' should be set using
// the correct namespace in order to work
var XlinkHandler = AttributeHandler.extend({
  update: function(element, oldValue, value) {
    var NS = 'http://www.w3.org/1999/xlink';
    if (value === null) {
      if (oldValue !== null)
        element.removeAttributeNS(NS, this.name);
    } else {
      element.setAttributeNS(NS, this.name, this.value);
    }
  }
});

// cross-browser version of `instanceof SVGElement`
var isSVGElement = function (elem) {
  return 'ownerSVGElement' in elem;
};

// XXX make it possible for users to register attribute handlers!
makeAttributeHandler = function (elem, name, value) {
  // generally, use setAttribute but certain attributes need to be set
  // by directly setting a JavaScript property on the DOM element.
  if (name === 'class') {
    if (isSVGElement(elem)) {
      return new SVGClassHandler(name, value);
    } else {
      return new ClassHandler(name, value);
    }
  } else if ((elem.tagName === 'OPTION' && name === 'selected') ||
             (elem.tagName === 'INPUT' && name === 'checked')) {
    return new BooleanHandler(name, value);
  } else if ((elem.tagName === 'TEXTAREA' || elem.tagName === 'INPUT')
             && name === 'value') {
    // internally, TEXTAREAs tracks their value in the 'value'
    // attribute just like INPUTs.
    return new ValueHandler(name, value);
  } else if (name.substring(0,6) === 'xlink:') {
    return new XlinkHandler(name.substring(6), value);
  } else {
    return new AttributeHandler(name, value);
  }

  // XXX will need one for 'style' on IE, though modern browsers
  // seem to handle setAttribute ok.
};


ElementAttributesUpdater = function (elem) {
  this.elem = elem;
  this.handlers = {};
};

// Update attributes on `elem` to the dictionary `attrs`, whose
// values are strings.
ElementAttributesUpdater.prototype.update = function(newAttrs) {
  var elem = this.elem;
  var handlers = this.handlers;

  for (var k in handlers) {
    if (! newAttrs.hasOwnProperty(k)) {
      // remove attributes (and handlers) for attribute names
      // that don't exist as keys of `newAttrs` and so won't
      // be visited when traversing it.  (Attributes that
      // exist in the `newAttrs` object but are `null`
      // are handled later.)
      var handler = handlers[k];
      var oldValue = handler.value;
      handler.value = null;
      handler.update(elem, oldValue, null);
      delete handlers[k];
    }
  }

  for (var k in newAttrs) {
    var handler = null;
    var oldValue;
    var value = newAttrs[k];
    if (! handlers.hasOwnProperty(k)) {
      if (value !== null) {
        // make new handler
        handler = makeAttributeHandler(elem, k, value);
        handlers[k] = handler;
        oldValue = null;
      }
    } else {
      handler = handlers[k];
      oldValue = handler.value;
    }
    if (oldValue !== value) {
      handler.value = value;
      handler.update(elem, oldValue, value);
      if (value === null)
        delete handlers[k];
    }
  }
};
