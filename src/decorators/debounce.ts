import _ from 'lodash';

function debounce(wait = 1000, options) {
  const defaultOptions = {
    trailing: false,
    leading: true
  };
  const opts = Object.assign({}, defaultOptions, options);

  return function(target, propertyKey, descriptor) {
    const originMethod = descriptor.value;
    const originMethodDebounced = _.debounce(originMethod, wait, opts);
    descriptor.value = function(...args) {
      return originMethodDebounced.apply(this, args);
    };

    return descriptor;
  };
}

export { debounce };
