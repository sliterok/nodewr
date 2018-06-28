/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('amap', {
    id: {
      type: DataTypes.INTEGER(6),
      allowNull: true,
      unique: true
    },
    Country: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    uid: {
      type: DataTypes.INTEGER(11),
      allowNull: false,
      defaultValue: '13'
    },
    sp: {
      type: DataTypes.INTEGER(4),
      allowNull: true
    },
    area: {
      type: DataTypes.INTEGER(11),
      allowNull: false
    }
  }, {
    tableName: 'amap'
  });
};
